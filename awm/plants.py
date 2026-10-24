"""Hidden environments. Only the experiment harness owns these objects."""
import math
from .core import Random, G


class NumericalPlant:
    engine = "numerical-1d"

    def __init__(self, scenario):
        scenario.validate()
        self.c, self.x, self.index = scenario, scenario.start, 0
        self.random = Random(scenario.seed)
        self.measured = None

    def observe(self):
        self.measured = self.x+self.c.noise*self.random.normal()
        return self.measured

    @property
    def true_mu(self):
        return self.c.shiftMu if self.c.shiftMu is not None and self.index >= self.c.shiftAfter else self.c.mu

    def execute(self, velocity):
        if not math.isfinite(velocity) or abs(velocity) > self.c.maxSpeed+1e-9:
            raise ValueError("Invalid release velocity")
        start = self.measured if self.measured is not None else self.observe()
        mu, v, t = self.true_mu, velocity, 0.
        trace = [dict(t=t, x=self.x, v=v)]
        for k in range(5000):
            if abs(v) <= 1e-6:
                break
            a = mu*G+self.c.drag*v*v
            h = min(.002, abs(v)/a)
            next_v = math.copysign(max(0., abs(v)-a*h), v)
            self.x += (v+next_v)*h/2
            t += h
            v = next_v
            if k % 8 == 0 or v == 0:
                trace.append(dict(t=t, x=self.x, v=v))
        end = self.x+self.c.noise*self.random.normal()
        self.index += 1
        self.measured = None
        return dict(observation=dict(start=start, end=end, velocity=velocity, duration=t),
                    evaluation=dict(x=self.x, mu=mu, boundary=self.x<self.c.lo or self.x>self.c.hi, trace=trace))


class MujocoPlant(NumericalPlant):
    """Box with x/z slide joints, no rotation; gravity-supported frictional contact.

    qvel initialization abstracts a calibrated impulsive launcher. It is NOT a
    robotic arm or a contact-force control policy. The planner never sees mjData.
    """
    engine = "mujoco-contact-1d"

    def __init__(self, scenario):
        super().__init__(scenario)
        try:
            import mujoco
        except ImportError as exc:
            raise RuntimeError("Install MuJoCo with: pip install -e '.[mujoco]'") from exc
        self.mj = mujoco
        self.model = mujoco.MjModel.from_xml_string('''
<mujoco model="adaptive_world_glide">
  <option timestep="0.001" gravity="0 0 -9.81" integrator="implicitfast" cone="elliptic" iterations="100"/>
  <worldbody>
    <light pos="0 0 3"/>
    <geom name="table" type="plane" size="5 1 .1" rgba=".12 .17 .22 1"/>
    <body name="box" pos="0 0 .04">
      <joint name="slide_x" type="slide" axis="1 0 0" damping="0"/>
      <joint name="slide_z" type="slide" axis="0 0 1" damping="0"/>
      <geom name="cube" type="box" size=".04 .06 .04" mass="1" rgba="1 .55 .25 1"/>
    </body>
    <camera name="top" pos="1.2 0 3"/>
  </worldbody>
  <contact><pair name="box_table" geom1="cube" geom2="table" condim="3"
    friction=".16 .16 .001 .0001 .0001" solref=".004 1" solimp=".999 .9999 .001"/></contact>
</mujoco>''')
        self.data = mujoco.MjData(self.model)
        self.model.pair_friction[0, :2] = scenario.mu
        self.data.qpos[0] = scenario.start
        for _ in range(300):
            mujoco.mj_step(self.model, self.data)
        self.x = float(self.data.qpos[0])

    def execute(self, velocity):
        if not math.isfinite(velocity) or abs(velocity) > self.c.maxSpeed+1e-9:
            raise ValueError("Invalid release velocity")
        start = self.measured if self.measured is not None else self.observe()
        mu = self.true_mu
        self.model.pair_friction[0, :2] = mu
        self.data.qvel[0] = velocity
        self.data.qacc_warmstart[:] = 0
        trace, stable, t = [dict(t=0., x=self.x, v=velocity)], 0, 0.
        for k in range(10000):
            v = float(self.data.qvel[0])
            self.data.qfrc_applied[0] = -self.c.drag*v*abs(v)
            self.mj.mj_step(self.model, self.data)
            t += .001
            self.x = float(self.data.qpos[0])
            v = float(self.data.qvel[0])
            if k % 16 == 0:
                trace.append(dict(t=t, x=self.x, v=v))
            stable = stable+1 if abs(v)<.001 else 0
            if stable >= 25:
                break
        else:
            raise RuntimeError("MuJoCo glide failed to settle within 10 seconds")
        trace.append(dict(t=t, x=self.x, v=v))
        end = self.x+self.c.noise*self.random.normal()
        self.index += 1
        self.measured = None
        return dict(observation=dict(start=start, end=end, velocity=velocity, duration=t),
                    evaluation=dict(x=self.x, mu=mu, boundary=self.x<self.c.lo or self.x>self.c.hi, trace=trace))
