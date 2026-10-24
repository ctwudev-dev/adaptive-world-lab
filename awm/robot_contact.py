"""Independent MuJoCo object/table AND actuated pusher/object contacts.

The cylindrical object translates in x/y/z; rotation is locked. The light pusher
has x/y slide joints driven by force motors. No object velocity is initialized
to launch it, and no horizontal wrench is applied directly to the object.
The canonical JS controller runs through a narrow JSON sensor interface.
"""
import json
import math
from pathlib import Path
import subprocess

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ENGINE = "mujoco-pusher-contact-2d"
RADIUS = 0.055
PUSHER_RADIUS = 0.025
PUSHER_MASS = 0.06


class PolicyBridge:
    def __init__(self):
        self.process = subprocess.Popen(
            ["node", str(ROOT / "scripts/robot_bridge.mjs")],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1,
        )

    def call(self, operation, **kwargs):
        self.process.stdin.write(json.dumps(dict(operation=operation, **kwargs)) + "\n")
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError("The controller bridge stopped.")
        result = json.loads(line)
        if not result["ok"]:
            raise ValueError(result["error"])
        return result["value"]

    def close(self):
        self.process.stdin.close()
        self.process.wait(timeout=10)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


class ContactPlant:
    def __init__(self, hidden):
        import mujoco
        self.mj = mujoco
        self.hidden = dict(hidden)
        mass, mu = float(hidden["mass"]), float(hidden["mu"])
        if not (.35 <= mass <= 1.55 and .08 <= mu <= .62):
            raise ValueError("Unsupported object physics.")
        self.model = mujoco.MjModel.from_xml_string(f'''
<mujoco model="robot_physics_contact">
  <option timestep="0.001" gravity="0 0 -9.81" integrator="implicitfast"
    cone="elliptic" iterations="80" tolerance="1e-10"/>
  <worldbody>
    <geom name="table" type="plane" size="4 4 .1" friction="0 0 0"/>
    <body name="object" pos="0 0 .035">
      <joint name="object_x" type="slide" axis="1 0 0"/>
      <joint name="object_y" type="slide" axis="0 1 0"/>
      <joint name="object_z" type="slide" axis="0 0 1"/>
      <geom name="puck" type="cylinder" size="{RADIUS} .035" mass="{mass}"/>
    </body>
    <body name="pusher" pos="0 0 .035">
      <joint name="pusher_x" type="slide" axis="1 0 0"/>
      <joint name="pusher_y" type="slide" axis="0 1 0"/>
      <geom name="tip" type="sphere" size="{PUSHER_RADIUS}" mass="{PUSHER_MASS}"/>
    </body>
  </worldbody>
  <contact>
    <pair geom1="puck" geom2="table" condim="3" friction="{mu} {mu} 0 0 0"
      solref=".004 1" solimp=".999 .9999 .001"/>
    <pair geom1="tip" geom2="puck" condim="1" friction="0 0 0 0 0"
      solref=".003 1" solimp=".999 .9999 .001"/>
  </contact>
  <actuator>
    <motor name="force_x" joint="pusher_x" gear="1" ctrllimited="true" ctrlrange="-8 8"/>
    <motor name="force_y" joint="pusher_y" gear="1" ctrllimited="true" ctrlrange="-8 8"/>
  </actuator>
</mujoco>''')
        self.data = mujoco.MjData(self.model)
        self.data.qpos[:2] = hidden.get("start", [-.52, -.22])
        self.data.qpos[3:5] = [-3, -3]
        self.index = 0
        for _ in range(200):
            mujoco.mj_step(self.model, self.data)

    @property
    def position(self):
        return self.data.qpos[:2].tolist()

    def execute(self, action):
        force, duration = action["force"], action["duration"]
        direction = np.array([action["ux"], action["uy"]])
        if (not all(math.isfinite(x) for x in [force, duration, *direction])
            or not 1 <= force <= 8 or not .025 <= duration <= .34
            or abs(np.linalg.norm(direction) - 1) > 1e-7):
            raise ValueError("Invalid force pulse.")
        mu = self.hidden["mu"]
        if self.hidden.get("shiftMu") is not None and self.index >= self.hidden.get("shiftAfter", 2):
            mu = self.hidden["shiftMu"]
        self.model.pair_friction[0, :2] = mu
        self.data.qpos[3:5] = self.data.qpos[:2] - direction * (RADIUS + PUSHER_RADIUS + .0001)
        self.data.qvel[3:5] = 0
        self.data.qacc_warmstart[:] = 0
        self.mj.mj_forward(self.model, self.data)
        trace, normal_impulse, contact_steps, elapsed = [], 0., 0, 0.

        def point(phase):
            return dict(t=elapsed, x=float(self.data.qpos[0]), y=float(self.data.qpos[1]),
                        speed=float(np.linalg.norm(self.data.qvel[:2])),
                        px=float(self.data.qpos[3]), py=float(self.data.qpos[4]), phase=phase)

        trace.append(point("push"))
        # A short final timestep preserves the exact commanded pulse length.
        while elapsed < duration - 1e-10:
            h = min(.001, duration - elapsed)
            self.model.opt.timestep = h
            self.data.ctrl[:] = direction * force
            self.mj.mj_step(self.model, self.data)
            elapsed += h
            contacted = False
            for contact_id in range(self.data.ncon):
                contact = self.data.contact[contact_id]
                if {int(contact.geom1), int(contact.geom2)} == {1, 2}:
                    wrench = np.zeros(6)
                    self.mj.mj_contactForce(self.model, self.data, contact_id, wrench)
                    normal_impulse += abs(float(wrench[0])) * h
                    contacted = True
            contact_steps += int(contacted)
            if len(trace) == 1 or elapsed - trace[-1]["t"] >= .015:
                trace.append(point("push"))
        pulse = self.position
        trace.append(point("push"))
        # Retract the pusher. Repositioning time is charged by the harness.
        self.data.ctrl[:] = 0
        self.data.qpos[3:5] = [-3, -3]
        self.data.qvel[3:5] = 0
        self.data.qacc_warmstart[:] = 0
        self.model.opt.timestep = .001
        stable = 0
        for k in range(10000):
            self.mj.mj_step(self.model, self.data)
            elapsed += .001
            stable = stable + 1 if np.linalg.norm(self.data.qvel[:2]) < .001 else 0
            if k % 15 == 0:
                trace.append(point("coast"))
            if stable >= 30:
                break
        else:
            raise RuntimeError("MuJoCo object failed to settle.")
        trace.append(point("coast"))
        self.index += 1
        return dict(pulse=pulse, position=self.position, time=elapsed, trace=trace,
                    mu=mu, mass=self.hidden["mass"], normalImpulse=normal_impulse,
                    contactSteps=contact_steps, engine=ENGINE)


def run_contact_episode(hidden, method, bridge):
    # The bridge itself allowlists public fields on initialization. It never sees
    # this dictionary or the MuJoCo model/data objects.
    keys = ("start", "target", "bounds", "noise", "maxActions", "tolerance", "setupTime",
            "priorMu", "priorMass", "priorMuSd", "priorMassSd", "informationWeight", "seed")
    public = {k: hidden[k] for k in keys if k in hidden}
    state = bridge.call("initial", config=public, method=method)
    c = state["config"]
    plant = ContactPlant(dict(hidden, start=c["start"]))
    random = np.random.default_rng(c["seed"])

    def measure(p):
        return (np.array(p) + random.normal(0, c["noise"], 2)).tolist()

    def inside(p):
        a, b, d, e = c["bounds"]
        return a <= p[0] <= b and d <= p[1] <= e

    state["position"] = measure(plant.position)
    events = []
    while state["step"] < c["maxActions"] and inside(plant.position) and math.dist(plant.position, c["target"]) > c["tolerance"]:
        decision = bridge.call("plan", state=state)
        before = state["weights"]
        actual = plant.execute(decision["action"])
        observation = dict(start=state["position"], pulse=measure(actual["pulse"]), end=measure(actual["position"]))
        state = bridge.call("update", state=state, action=decision["action"], observation=observation)
        events.append(dict(index=state["step"], **decision, belief=before,
                           posterior=state["weights"], reset=state["reset"], observation=observation, actual=actual))
    return bridge.call("finish", config=c, method=method, events=events, state=state,
                       position=plant.position, engine=ENGINE)
