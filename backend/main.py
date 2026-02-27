import asyncio
import json
import time
from typing import Any, Dict, Optional, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from simulation import Aircraft

app = FastAPI(title="Descent Management Simulation")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

aircraft = Aircraft()
clients: Set[WebSocket] = set()


# ── FCU PATCH model ────────────────────────────────────────────────────────
class FCUPatch(BaseModel):
    model_config = {"extra": "allow"}

    fcu_spd_managed:  Optional[bool]  = None
    fcu_mach_mode:    Optional[bool]  = None
    fcu_sel_mach:     Optional[float] = None
    fcu_sel_spd:      Optional[int]   = None
    fcu_hdg_managed:  Optional[bool]  = None
    fcu_hdg_trk_mode: Optional[str]   = None
    fcu_vs_fpa_mode:  Optional[str]   = None
    fcu_sel_hdg:      Optional[float] = None
    fcu_sel_vs:       Optional[float] = None
    fcu_vs_managed:   Optional[bool]  = None
    fcu_sel_alt:      Optional[float] = None
    fcu_alt_step:     Optional[int]   = None
    metric_alt:       Optional[bool]  = None
    exped_active:     Optional[bool]  = None
    ap1_engaged:      Optional[bool]  = None
    ap2_engaged:      Optional[bool]  = None
    athr_engaged:     Optional[bool]  = None
    loc_armed:        Optional[bool]  = None
    appr_armed:       Optional[bool]  = None
    vs_pull:          Optional[bool]  = None


# ── Simulation loop ────────────────────────────────────────────────────────
async def simulation_loop():
    last = time.monotonic()
    while True:
        now  = time.monotonic()
        dt   = now - last
        last = now

        aircraft.update(dt)
        state_json = json.dumps(aircraft.get_state())

        dead = set()
        for ws in clients:
            try:
                await ws.send_text(state_json)
            except Exception:
                dead.add(ws)
        clients.difference_update(dead)

        await asyncio.sleep(0.1)


@app.on_event("startup")
async def startup():
    asyncio.create_task(simulation_loop())


# ── REST endpoints ─────────────────────────────────────────────────────────
@app.get("/state")
async def get_state():
    return aircraft.get_state()


@app.patch("/fcu")
async def patch_fcu(patch: FCUPatch):
    """Receive FCU control inputs and apply them to the simulation."""
    data = {k: v for k, v in patch.model_dump().items() if v is not None}
    aircraft.apply_fcu(data)
    return aircraft.get_state()


# ── WebSocket ──────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    clients.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        clients.discard(websocket)
    except Exception:
        clients.discard(websocket)
