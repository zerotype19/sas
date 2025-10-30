"""
Interactive Brokers Broker Microservice
FastAPI service that wraps ib_insync for SAS trading system
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from ib_insync import IB, Stock, Option, MarketOrder, LimitOrder, StopOrder, StopLimitOrder
import os
import time
import logging
from concurrent.futures import ThreadPoolExecutor
import threading

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Environment configuration
IB_HOST = os.getenv("IB_HOST", "127.0.0.1")
IB_PORT = int(os.getenv("IB_PORT", "7497"))  # 7497 paper, 7496 live
IB_CLIENT_ID = int(os.getenv("IB_CLIENT_ID", "19"))

app = FastAPI(
    title="IBKR Broker Service",
    description="Interactive Brokers integration for SAS",
    version="1.0.0"
)

# CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global IB connection
ib = IB()
_connected = False
_connection_lock = threading.Lock()


def _do_connect():
    """Connect to IB in dedicated thread"""
    import asyncio
    # Create new event loop for this thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    ib.connect(IB_HOST, IB_PORT, clientId=IB_CLIENT_ID, readonly=False)
    mkt_data_type = int(os.getenv("IB_MKT_DATA_TYPE", "3"))
    ib.reqMarketDataType(mkt_data_type)
    return mkt_data_type
    # Note: Don't close the loop - ib_insync needs it to keep running


def ensure_connected():
    """Ensure IB is connected (lazy connection)"""
    global _connected
    if not _connected:
        with _connection_lock:
            if not _connected:  # Double-check after acquiring lock
                logger.info(f"Connecting to IB Gateway at {IB_HOST}:{IB_PORT} (client {IB_CLIENT_ID})...")
                with ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(_do_connect)
                    mkt_data_type = future.result(timeout=10)
                
                data_type_name = {1: "Real-time", 3: "Delayed", 4: "Delayed-Frozen"}.get(mkt_data_type, "Unknown")
                logger.info(f"✓ Connected to IB Gateway successfully")
                logger.info(f"✓ Market data type: {data_type_name} ({mkt_data_type})")
                _connected = True


@app.on_event("startup")
async def startup():
    """Startup event"""
    logger.info("IBKR Broker Service starting...")
    # Connect to IB Gateway at startup
    ensure_connected()


@app.on_event("shutdown")
async def shutdown():
    """Disconnect from IB on shutdown"""
    if ib.isConnected():
        logger.info("Disconnecting from IB Gateway...")
        ib.disconnect()


# ===== Pydantic Models =====

class QuoteReq(BaseModel):
    symbol: str
    exchange: Optional[str] = "SMART"
    currency: Optional[str] = "USD"


class QuoteResp(BaseModel):
    symbol: str
    last: Optional[float]
    bid: Optional[float]
    ask: Optional[float]
    timestamp: int


class OptionChainReq(BaseModel):
    symbol: str
    exchange: Optional[str] = "SMART"
    currency: Optional[str] = "USD"
    right: Optional[str] = None  # 'C' or 'P'
    strike: Optional[float] = None
    expiry: Optional[str] = None  # YYYY-MM-DD


class OptionChainItem(BaseModel):
    symbol: str
    expiry: str
    strike: float
    right: str
    multiplier: int
    exchange: str


class OptionContract(BaseModel):
    symbol: str
    expiry: str  # YYYY-MM-DD
    strike: float
    right: str  # 'C' or 'P'
    exchange: Optional[str] = "SMART"


class OptionQuotesReq(BaseModel):
    contracts: List[OptionContract]


class OptionQuoteResp(BaseModel):
    symbol: str
    expiry: str
    strike: float
    right: str
    bid: Optional[float]
    ask: Optional[float]
    mid: Optional[float]
    last: Optional[float]
    iv: Optional[float]  # Implied Volatility
    delta: Optional[float]
    gamma: Optional[float]
    vega: Optional[float]
    theta: Optional[float]
    volume: Optional[int]
    openInterest: Optional[int]
    timestamp: int


class PlaceOrderReq(BaseModel):
    symbol: str
    assetType: Optional[str] = "STK"  # STK or OPT
    quantity: float
    side: str  # BUY or SELL
    orderType: str  # MKT, LMT, STP, STP_LMT
    limitPrice: Optional[float] = None
    stopPrice: Optional[float] = None
    tif: Optional[str] = "DAY"
    option: Optional[dict] = None


class OrderResp(BaseModel):
    orderId: int
    status: str


class PositionItem(BaseModel):
    symbol: str
    assetType: str
    quantity: float
    avgPrice: float
    marketPrice: Optional[float]
    unrealizedPnl: Optional[float]
    expiry: Optional[str] = None
    strike: Optional[float] = None
    right: Optional[str] = None


class AccountSummary(BaseModel):
    accountId: str
    cash: float
    equity: float
    buyingPower: Optional[float] = None
    excessLiquidity: Optional[float] = None


# ===== Helper Functions =====

def ts_ms():
    """Current timestamp in milliseconds"""
    return int(time.time() * 1000)


# ===== API Endpoints =====

@app.get("/")
async def root():
    """Health check"""
    return {
        "service": "IBKR Broker Service",
        "version": "1.0.0",
        "connected": ib.isConnected()
    }


@app.post("/quote", response_model=QuoteResp)
async def quote(req: QuoteReq):
    """Get real-time quote for a symbol"""
    
    def _get_quote():
        import asyncio
        # Create event loop for this thread if needed
        try:
            asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        contract = Stock(req.symbol, req.exchange, req.currency)
        ticker = ib.reqMktData(contract, "", False, False)
        ib.sleep(0.5)  # Wait for data
        ib.cancelMktData(contract)
        return ticker
    
    try:
        import asyncio
        loop = asyncio.get_event_loop()
        ticker = await loop.run_in_executor(None, _get_quote)
        
        return QuoteResp(
            symbol=req.symbol,
            last=ticker.last if ticker.last and ticker.last > 0 else None,
            bid=ticker.bid if ticker.bid and ticker.bid > 0 else None,
            ask=ticker.ask if ticker.ask and ticker.ask > 0 else None,
            timestamp=ts_ms()
        )
    except Exception as e:
        logger.error(f"Quote error for {req.symbol}: {e}")
        raise HTTPException(500, f"Quote failed: {e}")


@app.post("/optionChain", response_model=List[OptionChainItem])
async def option_chain(req: OptionChainReq):
    """Get option chain for a symbol"""
    try:
        # Get underlying contract details
        details = ib.reqContractDetails(Stock(req.symbol, req.exchange, req.currency))
        if not details:
            raise HTTPException(404, f"Underlying {req.symbol} not found")
        
        underlying = details[0]
        
        # Request option parameters
        params = ib.reqSecDefOptParams(
            req.symbol,
            "",
            underlying.contract.secType,
            underlying.contract.conId
        )
        
        if not params:
            raise HTTPException(404, "No option parameters found")
        
        out: List[OptionChainItem] = []
        
        for param in params:
            expiries = sorted(param.expirations)  # Format: YYYYMMDD
            strikes = sorted(param.strikes)
            
            for expiry in expiries:
                # Convert YYYYMMDD to YYYY-MM-DD
                iso_expiry = f"{expiry[:4]}-{expiry[4:6]}-{expiry[6:]}"
                
                # Filter by expiry if specified
                if req.expiry and req.expiry != iso_expiry:
                    continue
                
                for strike in strikes:
                    # Filter by strike if specified
                    if req.strike and abs(strike - req.strike) > 1e-9:
                        continue
                    
                    # Filter by right if specified
                    rights = [req.right] if req.right else ['C', 'P']
                    
                    for right in rights:
                        multiplier = int(param.multiplier) if param.multiplier.isdigit() else 100
                        
                        out.append(OptionChainItem(
                            symbol=req.symbol,
                            expiry=iso_expiry,
                            strike=strike,
                            right=right,
                            multiplier=multiplier,
                            exchange=req.exchange or "SMART"
                        ))
        
        # Limit to 5000 to avoid overwhelming response
        return out[:5000]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Option chain error for {req.symbol}: {e}")
        raise HTTPException(500, f"Option chain failed: {e}")


@app.post("/options/quotes", response_model=List[OptionQuoteResp])
async def option_quotes(req: OptionQuotesReq):
    """Get option quotes with greeks for specific contracts"""
    try:
        def _get_quotes():
            quotes = []
            for contract_req in req.contracts:
                # Convert YYYY-MM-DD to YYYYMMDD
                expiry_ib = contract_req.expiry.replace("-", "")
                
                # Create option contract
                contract = Option(
                    symbol=contract_req.symbol,
                    lastTradeDateOrContractMonth=expiry_ib,
                    strike=contract_req.strike,
                    right=contract_req.right.upper(),
                    exchange=contract_req.exchange or "SMART",
                    currency="USD"
                )
                
                # Request market data with greeks
                ib.reqMktData(contract, genericTickList="106", snapshot=True, regulatorySnapshot=False)
                
            # Wait for data to arrive
            ib.sleep(2.0)
            
            # Collect results
            for contract_req in req.contracts:
                expiry_ib = contract_req.expiry.replace("-", "")
                contract = Option(
                    symbol=contract_req.symbol,
                    lastTradeDateOrContractMonth=expiry_ib,
                    strike=contract_req.strike,
                    right=contract_req.right.upper(),
                    exchange=contract_req.exchange or "SMART",
                    currency="USD"
                )
                
                ticker = ib.ticker(contract)
                
                # Calculate mid price
                mid = None
                if ticker.bid and ticker.ask and ticker.bid > 0 and ticker.ask > 0:
                    mid = (ticker.bid + ticker.ask) / 2
                
                # Extract greeks
                model_greeks = ticker.modelGreeks
                delta = model_greeks.delta if model_greeks and model_greeks.delta else None
                gamma = model_greeks.gamma if model_greeks and model_greeks.gamma else None
                vega = model_greeks.vega if model_greeks and model_greeks.vega else None
                theta = model_greeks.theta if model_greeks and model_greeks.theta else None
                iv = model_greeks.impliedVol if model_greeks and model_greeks.impliedVol else None
                
                quotes.append(OptionQuoteResp(
                    symbol=contract_req.symbol,
                    expiry=contract_req.expiry,
                    strike=contract_req.strike,
                    right=contract_req.right.upper(),
                    bid=ticker.bid if ticker.bid and ticker.bid > 0 else None,
                    ask=ticker.ask if ticker.ask and ticker.ask > 0 else None,
                    mid=mid,
                    last=ticker.last if ticker.last and ticker.last > 0 else None,
                    iv=iv,
                    delta=delta,
                    gamma=gamma,
                    vega=vega,
                    theta=theta,
                    volume=int(ticker.volume) if ticker.volume and ticker.volume > 0 else None,
                    openInterest=int(ticker.openInterest) if ticker.openInterest and ticker.openInterest > 0 else None,
                    timestamp=int(time.time() * 1000)
                ))
                
                # Cancel market data subscription
                ib.cancelMktData(contract)
            
            return quotes
        
        import asyncio
        loop = asyncio.get_event_loop()
        quotes = await loop.run_in_executor(None, _get_quotes)
        
        return quotes
        
    except Exception as e:
        logger.error(f"Option quotes error: {e}")
        raise HTTPException(500, f"Option quotes failed: {e}")


@app.post("/placeOrder", response_model=OrderResp)
async def place_order(req: PlaceOrderReq):
    """Place an order"""
    try:
        side = req.side.upper()
        if side not in ("BUY", "SELL"):
            raise HTTPException(400, f"Invalid side: {req.side}")
        
        # Create contract
        if req.assetType == "OPT":
            if not req.option:
                raise HTTPException(400, "Option details required for OPT")
            
            opt = req.option
            expiry = opt["expiry"].replace("-", "")  # YYYY-MM-DD -> YYYYMMDD
            
            contract = Option(
                symbol=req.symbol,
                lastTradeDateOrContractMonth=expiry,
                strike=float(opt["strike"]),
                right=opt["right"].upper(),
                exchange=opt.get("exchange", "SMART"),
                currency="USD",
                multiplier=str(int(opt.get("multiplier", 100)))
            )
        else:
            contract = Stock(req.symbol, "SMART", "USD")
        
        # Create order
        order_type = req.orderType.upper()
        
        if order_type == "MKT":
            order = MarketOrder(side, req.quantity)
        elif order_type == "LMT":
            if req.limitPrice is None:
                raise HTTPException(400, "limitPrice required for LMT")
            order = LimitOrder(side, req.quantity, req.limitPrice)
        elif order_type == "STP":
            if req.stopPrice is None:
                raise HTTPException(400, "stopPrice required for STP")
            order = StopOrder(side, req.quantity, req.stopPrice)
        elif order_type == "STP_LMT":
            if req.stopPrice is None or req.limitPrice is None:
                raise HTTPException(400, "stopPrice and limitPrice required for STP_LMT")
            order = StopLimitOrder(side, req.quantity, req.limitPrice, req.stopPrice)
        else:
            raise HTTPException(400, f"Unsupported orderType: {req.orderType}")
        
        # Set time in force
        order.tif = req.tif or "DAY"
        
        # Place order
        trade = ib.placeOrder(contract, order)
        ib.sleep(0.3)  # Wait for acknowledgement
        
        logger.info(f"Order placed: {trade.order.orderId} - {side} {req.quantity} {req.symbol}")
        
        return OrderResp(
            orderId=trade.order.orderId or -1,
            status=trade.orderStatus.status or "Submitted"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Place order error: {e}")
        raise HTTPException(500, f"Order failed: {e}")


@app.get("/positions", response_model=List[PositionItem])
async def positions():
    """Get all positions"""
    try:
        ib.reqPositions()
        ib.sleep(0.5)  # Wait for positions
        
        out: List[PositionItem] = []
        
        for account, contract, qty, avg_price in ib.positions():
            symbol = getattr(contract, "symbol", getattr(contract, "localSymbol", ""))
            asset_type = contract.secType.upper()
            
            base = {
                "symbol": symbol,
                "assetType": asset_type,
                "quantity": qty,
                "avgPrice": avg_price,
                "marketPrice": None,
                "unrealizedPnl": None
            }
            
            # Add option-specific fields
            if asset_type == "OPT":
                expiry = contract.lastTradeDateOrContractMonth
                if expiry and len(expiry) == 8:
                    expiry = f"{expiry[:4]}-{expiry[4:6]}-{expiry[6:]}"
                
                base.update({
                    "expiry": expiry,
                    "strike": contract.strike,
                    "right": contract.right
                })
            
            out.append(PositionItem(**base))
        
        return out
        
    except Exception as e:
        logger.error(f"Positions error: {e}")
        raise HTTPException(500, f"Positions failed: {e}")


@app.get("/account", response_model=AccountSummary)
async def account():
    """Get account summary"""
    try:
        # Get account values directly (simpler than accountSummary)
        values = ib.accountValues()
        
        # Filter to the tags we want
        tags = ["TotalCashValue", "NetLiquidation", "BuyingPower", "ExcessLiquidity"]
        summary = [v for v in values if v.tag in tags]
        
        if not summary:
            raise HTTPException(500, "No account data available")
        
        # Build tag -> value mapping
        data = {(s.tag, s.account): s.value for s in summary}
        
        # Get account ID
        acct = summary[0].account if summary else "UNKNOWN"
        
        def get_float(tag: str) -> float:
            value = data.get((tag, acct), "0") or "0"
            try:
                return float(value)
            except:
                return 0.0
        
        return AccountSummary(
            accountId=acct,
            cash=get_float("TotalCashValue"),
            equity=get_float("NetLiquidation"),
            buyingPower=get_float("BuyingPower") or None,
            excessLiquidity=get_float("ExcessLiquidity") or None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Account error: {e}")
        raise HTTPException(500, f"Account failed: {e}")

