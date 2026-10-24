"""Controller: receives sensor observations, never plant parameters or simulator objects.

One action is a calibrated release velocity followed by a complete free glide.
The analytic predictor and numerical/MuJoCo plants are independent implementations.
"""
from dataclasses import dataclass, asdict
import math
import numpy as np

G = 9.81
GRID = np.linspace(.08, .8, 81)
METHODS = ("fixed", "passive", "active", "robust")


@dataclass(frozen=True)
class ControllerConfig:
    prior: float = .44
    priorSd: float = .16
    noise: float = .003
    target: float = 1.65
    tolerance: float = .06
    lo: float = .08
    hi: float = 2.32
    maxActions: int = 6
    maxSpeed: float = 2.3


@dataclass(frozen=True)
class Scenario(ControllerConfig):
    mu: float = .10
    drag: float = 0.
    shiftMu: float | None = None
    shiftAfter: int = 2
    start: float = .38
    seed: int = 42

    def public(self):
        values = asdict(self)
        return ControllerConfig(**{k: values[k] for k in ControllerConfig.__dataclass_fields__})

    def validate(self):
        for k, v in asdict(self).items():
            if v is not None and not math.isfinite(v):
                raise ValueError(f"Non-finite {k}")
        if not (.08 <= self.mu <= .8 and .08 <= self.prior <= .8):
            raise ValueError("Friction must be in [0.08, 0.8]")
        if self.priorSd <= 0 or self.noise < 0 or self.drag < 0:
            raise ValueError("Invalid uncertainty or drag")
        if not (self.lo <= self.start <= self.hi and self.lo <= self.target <= self.hi):
            raise ValueError("Start/target outside table")
        if self.tolerance <= 0 or not isinstance(self.maxActions, int) or not 1 <= self.maxActions <= 20 or not .08 <= self.maxSpeed <= 4:
            raise ValueError("Invalid task budget")
        if self.shiftMu is not None and not .08 <= self.shiftMu <= .8:
            raise ValueError("Invalid shifted friction")
        if not isinstance(self.shiftAfter, int) or self.shiftAfter < 0:
            raise ValueError("Invalid change point")
        if not isinstance(self.seed, int) or not 0 <= self.seed <= 4294967295:
            raise ValueError("Invalid seed")


class Random:
    """Mulberry32 + Box-Muller, intentionally identical to the browser reference."""
    def __init__(self, seed):
        self.a = int(seed) & 0xffffffff

    def uniform(self):
        self.a = (self.a + 0x6D2B79F5) & 0xffffffff
        t = ((self.a ^ (self.a >> 15)) * (1 | self.a)) & 0xffffffff
        t ^= (t + (((t ^ (t >> 7)) * (61 | t)) & 0xffffffff)) & 0xffffffff
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296

    def normal(self):
        return math.sqrt(-2*math.log(max(1e-12, self.uniform()))) * math.cos(2*math.pi*self.uniform())


def prior_for(c):
    w = np.exp(-.5*((GRID-c.prior)/c.priorSd)**2)
    return w/w.sum()


def quantile(w, q):
    return float(GRID[min(len(GRID)-1, np.searchsorted(np.cumsum(w), q))])


def stats(w):
    mean = float(w @ GRID)
    return dict(mean=mean, sd=float(np.sqrt(w @ (GRID-mean)**2)),
                low=quantile(w, .025), high=quantile(w, .975),
                entropy=-float(w @ np.log(np.maximum(w, 1e-300))))


def distance(u, mu):
    return u*abs(u)/(2*mu*G)


def likelihood_sd(d, c):
    return np.sqrt(2*c.noise**2+.003**2+(.025*np.abs(d))**2)


def predict(x, u, w, c):
    ends = x+distance(u, GRID)
    mean = float(w @ ends)
    order = np.argsort(ends)
    cw = np.cumsum(w[order])
    def q(p):
        return float(ends[order[min(len(ends)-1, np.searchsorted(cw, p))]])
    return dict(mean=mean, low=q(.025), high=q(.975),
                risk=float(w @ ((ends < c.lo) | (ends > c.hi))),
                sd=float(np.sqrt(w @ (ends-mean)**2)))


def information_gain(u, w, c):
    d = distance(u, GRID)
    s = likelihood_sd(d, c)
    mask = w > .0001
    low, high = np.min((d-4*s)[mask]), np.max((d+4*s)[mask])
    dy = (high-low)/96
    y = low+(np.arange(96)+.5)*dy
    pdf = np.exp(-.5*((y[:, None]-d[None, :])/s[None, :])**2)/(s[None, :]*np.sqrt(2*np.pi))
    mix = pdf @ w
    logratio = np.log(np.maximum(pdf, 1e-300))-np.log(np.maximum(mix[:, None], 1e-300))
    return max(0., float(np.sum(pdf*w[None, :]*logratio)*dy))


class Controller:
    def __init__(self, method: str, config: ControllerConfig):
        if method not in METHODS:
            raise ValueError(f"Unknown method: {method}")
        # Reject accidental passage of a Scenario, even though it is a subclass.
        if type(config) is not ControllerConfig:
            raise TypeError("Only a whitelisted ControllerConfig may enter the controller")
        self.method, self.c = method, config
        self.w = prior_for(config)
        if method == "fixed":
            self.w = np.zeros_like(GRID)
            self.w[np.argmin(np.abs(GRID-config.prior))] = 1.

    def decide(self, measured_x):
        c, w = self.c, self.w
        direction = np.sign(c.target-measured_x) or 1
        us = direction*np.linspace(.08, c.maxSpeed, 64)
        ends = measured_x+us[:, None]*np.abs(us[:, None])/(2*GRID[None, :]*G)
        if self.method == "fixed":
            end = measured_x+us*np.abs(us)/(2*c.prior*G)
            losses = (end-c.target)**2+25*((end < c.lo) | (end > c.hi))
        elif self.method == "robust":
            a, b = ends[:, 0], ends[:, -1]
            losses = np.maximum((a-c.target)**2, (b-c.target)**2)+25*((np.minimum(a,b) < c.lo) | (np.maximum(a,b) > c.hi))
        else:
            losses = ((ends-c.target)**2+25*((ends < c.lo) | (ends > c.hi))) @ w
        losses += .0008*us**2
        index = int(np.argmin(losses))
        action = dict(velocity=float(us[index]), kind="task", loss=float(losses[index]))
        st = stats(w)
        if self.method == "active" and st["sd"] > .055:
            best = None
            for v in (.3, .45, .6, .75, .9, 1.05):
                u = float(direction*v)
                prediction = predict(measured_x, u, w, c)
                if prediction["risk"] > .001 or abs(prediction["mean"]-measured_x) > .55*abs(c.target-measured_x):
                    continue
                info = information_gain(u, w, c)
                score = info-3*abs(prediction["mean"]-measured_x)-.03*u*u
                if best is None or score > best["score"]:
                    best = dict(velocity=u, kind="probe", info=info, score=score)
            if best is not None and best["score"] > .25:
                action = best
        prediction = predict(measured_x, action["velocity"], w, c)
        if self.method == "fixed":
            endpoint = float(measured_x+distance(action["velocity"], c.prior))
            prediction = dict(mean=endpoint, low=endpoint, high=endpoint, risk=int(endpoint<c.lo or endpoint>c.hi), sd=0.)
        return dict(**action, prediction=prediction, belief=w.tolist(), stats=st)

    def learn(self, observation):
        if self.method in ("fixed", "robust"):
            return dict(reset=False, innovation=None)
        c, w = self.c, self.w
        d = observation["end"]-observation["start"]
        means = distance(observation["velocity"], GRID)
        sd = likelihood_sd(means, c)
        pred = float(w @ means)
        variance = float(w @ ((means-pred)**2+sd**2))
        innovation = abs(d-pred)/math.sqrt(variance)
        reset = innovation > 4
        base = prior_for(c) if reset else w
        logs = np.log(np.maximum(base, 1e-300))-.5*((d-means)/sd)**2-np.log(sd)
        post = np.exp(logs-np.max(logs))
        post /= post.sum()
        self.w = .99*post+.01*prior_for(c)
        return dict(reset=reset, innovation=innovation)
