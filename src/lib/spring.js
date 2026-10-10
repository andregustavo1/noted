// Gesture-driven motion in Apple's terms (WWDC 2018 "Designing Fluid Interfaces"). Values here are a progress
// (0 to 1 across the gesture's whole travel), and velocities that progress per second.

// A spring run frame by frame from wherever the value is, carrying the gesture's velocity, so it can be grabbed
// mid-flight: returns a function that stops it there. damping 1 settles without overshoot, lower overshoots;
// response is about how long it takes, in seconds.
export const animateSpring = ({ from, to, velocity = 0, damping = 0.8, response = 0.3, onFrame, onDone }) => {
    const w = (2 * Math.PI) / response;
    let x = from, v = velocity, last = performance.now(), frame;
    const tick = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000); // a frame held up (app in the background) doesn't fling it
        last = now;
        for (let t = 0; t < dt; t += 0.001) {
            const h = Math.min(0.001, dt - t);
            v += (-w * w * (x - to) - 2 * damping * w * v) * h;
            x += v * h;
        }
        const settled = Math.abs(x - to) < 0.001 && Math.abs(v) < 0.01;
        onFrame(settled ? to : x);
        if (settled) onDone?.();
        else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
};

// Where a flick would coast to with the system's normal scroll deceleration: a short fast flick counts like a long drag.
export const project = (velocity, rate = 0.998) => (velocity / 1000) * rate / (1 - rate);

// Past a limit the drag keeps following, ever more stiffly (UIScrollView's rubber band). x past the limit, d the travel.
export const rubber = (x, d) => (1 - 1 / ((x * 0.55) / d + 1)) * d;

// The finger's velocity over its last 100ms, in units per second.
export const tracker = () => {
    let samples = [];
    const recent = () => { const now = performance.now(); return (samples = samples.filter(([t]) => now - t < 100)); };
    return {
        add: (x) => { samples.push([performance.now(), x]); recent(); },
        velocity: () => {
            const s = recent();
            if (s.length < 2) return 0;
            const [[t0, x0], [t1, x1]] = [s[0], s[s.length - 1]];
            return t1 > t0 ? ((x1 - x0) / (t1 - t0)) * 1000 : 0;
        },
    };
};
