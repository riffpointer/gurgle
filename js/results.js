const fake_link_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const gurgle_footer = "<small id='results-footer' class='results-footer'>&copy; 2069 <a href='https://github.com/riffpointer'>riffpointer</a></small>";
let currentTabIndex = parseInt(url_params.i ? url_params.i : 1, 10);
let currentSearchTerm = url_params.q || "";
let cachedResults = null;
let cachedQueries = null;
let resultsContainer = null;
let searchCountElement = null;
let gravityModeActive = false;
let gravityFloorY = 0;
let gravityWorldWidth = 0;
let gravityLayer = null;
let windCursor = {
    x: window.innerWidth / 2 + window.scrollX,
    y: window.innerHeight / 2 + window.scrollY,
};
let dragState = null;
let gravityBodies = [];
let gravityFrame = 0;
let gravityAccumulator = 0;
let gravityPrevTime = 0;
let windActivity = 0;

const FIXED_STEP = 1 / 120;
const MAX_FRAME_TIME = 1 / 30;
const SOLVER_SUBSTEPS = 2;
const COLLISION_PASSES = 5;
const GRAVITY_ACCEL = 1800;
const NODE_DAMPING = 0.992;
const STRUCTURAL_STIFFNESS = 115;
const DIAGONAL_STIFFNESS = 94;
const CENTER_STIFFNESS = 128;
const SPRING_DAMPING = 8.5;
const AREA_STIFFNESS = 0.0035;
const WALL_RESTITUTION = 0.16;
const FLOOR_RESTITUTION = 0.18;
const BODY_RESTITUTION = 0.1;
const SURFACE_FRICTION = 0.965;
const BODY_FRICTION = 0.18;
const WIND_FORCE = 380;
const WIND_RADIUS = 260;
const DRAG_STIFFNESS = 650;
const DRAG_DAMPING = 42;
const MAX_NODE_SPEED = 2400;
const ANGULAR_DAMPING = 0.986;
const MAX_ANGULAR_SPEED = 5.2;
const WIND_ACTIVITY_DECAY = 0.88;
const SLEEP_LINEAR_SPEED = 18;
const SLEEP_ANGULAR_SPEED = 0.12;
const SLEEP_FRAMES = 12;
const POINTER_VELOCITY_LIMIT = 2200;
const CONTACT_SLOP = 0.5;
const BODY_TRANSLATION_SHARE = 0.34;
const CONTACT_TRANSLATION_SHARE = 0.66;

const gurgleData = window.gurgleData || {};
const {
    resultFaviconPaths = [],
    overviewIconPaths = [],
    introStabs = [],
    midWeaves = [],
    punchlines = [],
    questionPools: questionPoolData = {},
    questionSpecial = [],
    unhingedImagePool = [],
} = gurgleData;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const rotateVector = (x, y, angle) => ({
    x: (x * Math.cos(angle)) - (y * Math.sin(angle)),
    y: (x * Math.sin(angle)) + (y * Math.cos(angle)),
});

const pickRandom = (array) => {
    if (!Array.isArray(array) || array.length === 0) {
        return null;
    }
    return array[Math.floor(Math.random() * array.length)];
};

const descriptors = {
    looks: ["dangerously cute", "suspiciously charming", "stealth hottie"],
    attraction: ["radioactive envy", "thermonuclear fire", "unstoppable heat"],
    brains: ["strategy only a Reddit mod could follow", "Einstein-lite energy", "deceptively sharp"],
    love: ["unstable chemistry", "algorithmic luck", "randomized destiny"],
    approval: ["viral approval rating", "glitch in the popularity meter", "red flag magnetism"],
    wit: ["deadpan wit slider", "meme-grade sarcasm", "dark humor delivery"],
    default: ["mystery sauce", "probabilistic spice", "viral consensus"],
};

const probabilityPhrase = (value, theme) => `${value}% odds of ${descriptors[theme] || descriptors.default}`;

const createNode = (x, y, mass) => ({
    x,
    y,
    vx: 0,
    vy: 0,
    fx: 0,
    fy: 0,
    mass,
});

const createSpring = (a, b, restLength, stiffness) => ({
    a,
    b,
    restLength,
    stiffness,
    damping: SPRING_DAMPING,
});

const getBodyCorners = (body) => [
    body.nodes[0],
    body.nodes[1],
    body.nodes[2],
    body.nodes[3],
];

const getBodyCenter = (body) => {
    const corners = getBodyCorners(body);
    let x = 0;
    let y = 0;
    corners.forEach((corner) => {
        x += corner.x;
        y += corner.y;
    });
    return {
        x: x / corners.length,
        y: y / corners.length,
    };
};

const polygonArea = (points) => {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        area += (current.x * next.y) - (next.x * current.y);
    }
    return area * 0.5;
};

const getBodyBounds = (body) => {
    const center = getBodyCenter(body);
    const halfWidth = body.width / 2;
    const halfHeight = body.height / 2;
    const cos = Math.abs(Math.cos(body.angle));
    const sin = Math.abs(Math.sin(body.angle));
    const aabbHalfWidth = (halfWidth * cos) + (halfHeight * sin);
    const aabbHalfHeight = (halfWidth * sin) + (halfHeight * cos);

    return {
        left: center.x - aabbHalfWidth,
        top: center.y - aabbHalfHeight,
        right: center.x + aabbHalfWidth,
        bottom: center.y + aabbHalfHeight,
        centerX: center.x,
        centerY: center.y,
        halfWidth: aabbHalfWidth,
        halfHeight: aabbHalfHeight,
    };
};

const getBodyMass = (body) => (
    dragState && dragState.body === body
        ? body.mass * 2.6
        : body.mass
);

const getBodyCollision = (a, b) => {
    const boundsA = getBodyBounds(a);
    const boundsB = getBodyBounds(b);
    if (
        boundsA.right <= boundsB.left ||
        boundsA.left >= boundsB.right ||
        boundsA.bottom <= boundsB.top ||
        boundsA.top >= boundsB.bottom
    ) {
        return null;
    }

    const deltaX = boundsB.centerX - boundsA.centerX;
    const deltaY = boundsB.centerY - boundsA.centerY;
    const overlapX = (boundsA.halfWidth + boundsB.halfWidth) - Math.abs(deltaX);
    const overlapY = (boundsA.halfHeight + boundsB.halfHeight) - Math.abs(deltaY);

    if (overlapX <= CONTACT_SLOP || overlapY <= CONTACT_SLOP) {
        return null;
    }

    const distance = Math.hypot(deltaX, deltaY);
    const normal = distance > 0.0001
        ? { x: deltaX / distance, y: deltaY / distance }
        : { x: 0, y: -1 };
    const moveAlongCenterX = Math.abs(normal.x) > 0.0001 ? overlapX / Math.abs(normal.x) : Infinity;
    const moveAlongCenterY = Math.abs(normal.y) > 0.0001 ? overlapY / Math.abs(normal.y) : Infinity;
    const overlap = Math.min(moveAlongCenterX, moveAlongCenterY) - CONTACT_SLOP;

    if (!Number.isFinite(overlap) || overlap <= 0) {
        return null;
    }

    return { normal, overlap };
};

const averageVelocity = (body, nodeIndices) => {
    let vx = 0;
    let vy = 0;
    nodeIndices.forEach((index) => {
        vx += body.nodes[index].vx;
        vy += body.nodes[index].vy;
    });
    return {
        x: vx / nodeIndices.length,
        y: vy / nodeIndices.length,
    };
};

const getSupportNodeIndices = (body, normal) => {
    const cornerIndices = [0, 1, 2, 3];
    let maxProjection = -Infinity;
    cornerIndices.forEach((index) => {
        const node = body.nodes[index];
        const projection = (node.x * normal.x) + (node.y * normal.y);
        maxProjection = Math.max(maxProjection, projection);
    });
    return cornerIndices.filter((index) => {
        const node = body.nodes[index];
        const projection = (node.x * normal.x) + (node.y * normal.y);
        return maxProjection - projection < 12;
    });
};

const translateBody = (body, dx, dy, nodeIndices = null) => {
    const indices = nodeIndices || body.nodes.map((_, index) => index);
    indices.forEach((index) => {
        body.nodes[index].x += dx;
        body.nodes[index].y += dy;
    });
};

const applyImpulse = (body, nodeIndices, impulseX, impulseY) => {
    nodeIndices.forEach((index) => {
        const node = body.nodes[index];
        node.vx += impulseX / node.mass;
        node.vy += impulseY / node.mass;
    });
};

const updateBodyTransform = (body) => {
    const center = getBodyCenter(body);
    const left = center.x - (body.width / 2);
    const top = center.y - (body.height / 2);

    body.element.style.transform = `translate(${left}px, ${top}px) rotate(${body.angle}rad)`;
};

const setBodyPose = (body, center) => {
    const corners = [
        { x: -body.width / 2, y: -body.height / 2 },
        { x: body.width / 2, y: -body.height / 2 },
        { x: body.width / 2, y: body.height / 2 },
        { x: -body.width / 2, y: body.height / 2 },
    ];

    corners.forEach((corner, index) => {
        const rotated = rotateVector(corner.x, corner.y, body.angle);
        body.nodes[index].x = center.x + rotated.x;
        body.nodes[index].y = center.y + rotated.y;
        body.nodes[index].vx = 0;
        body.nodes[index].vy = 0;
    });

    body.nodes[4].x = center.x;
    body.nodes[4].y = center.y;
    body.nodes[4].vx = 0;
    body.nodes[4].vy = 0;
};

const wakeBody = (body) => {
    body.sleeping = false;
    body.sleepFrames = 0;
};

const createSoftBody = (element, top, left, width, height) => {
    const bodyMass = Math.max(1.35, (width * height) / 24000);
    const cornerMass = bodyMass * 0.18;
    const centerMass = bodyMass * 0.28;

    const body = {
        element,
        width,
        height,
        mass: bodyMass,
        inertia: (bodyMass * ((width * width) + (height * height))) / 12,
        angle: 0,
        angularVelocity: 0,
        sleeping: false,
        sleepFrames: 0,
        contacting: false,
        restArea: width * height,
        nodes: [
            createNode(left, top, cornerMass),
            createNode(left + width, top, cornerMass),
            createNode(left + width, top + height, cornerMass),
            createNode(left, top + height, cornerMass),
            createNode(left + (width / 2), top + (height / 2), centerMass),
        ],
        springs: [],
    };

    body.springs.push(
        createSpring(0, 1, width, STRUCTURAL_STIFFNESS),
        createSpring(1, 2, height, STRUCTURAL_STIFFNESS),
        createSpring(2, 3, width, STRUCTURAL_STIFFNESS),
        createSpring(3, 0, height, STRUCTURAL_STIFFNESS),
        createSpring(0, 2, Math.hypot(width, height), DIAGONAL_STIFFNESS),
        createSpring(1, 3, Math.hypot(width, height), DIAGONAL_STIFFNESS),
        createSpring(0, 4, Math.hypot(width / 2, height / 2), CENTER_STIFFNESS),
        createSpring(1, 4, Math.hypot(width / 2, height / 2), CENTER_STIFFNESS),
        createSpring(2, 4, Math.hypot(width / 2, height / 2), CENTER_STIFFNESS),
        createSpring(3, 4, Math.hypot(width / 2, height / 2), CENTER_STIFFNESS)
    );

    return body;
};

const getBodyLinearVelocity = (body) => averageVelocity(body, [0, 1, 2, 3, 4]);

const applySpringForces = (body) => {
    body.springs.forEach((spring) => {
        const nodeA = body.nodes[spring.a];
        const nodeB = body.nodes[spring.b];
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const distance = Math.max(Math.hypot(dx, dy), 0.0001);
        const nx = dx / distance;
        const ny = dy / distance;
        const stretch = distance - spring.restLength;
        const relativeVelocity = ((nodeB.vx - nodeA.vx) * nx) + ((nodeB.vy - nodeA.vy) * ny);
        const force = (spring.stiffness * stretch) + (spring.damping * relativeVelocity);
        const forceX = nx * force;
        const forceY = ny * force;

        nodeA.fx += forceX;
        nodeA.fy += forceY;
        nodeB.fx -= forceX;
        nodeB.fy -= forceY;
    });
};

const applyAreaForce = (body) => {
    const corners = getBodyCorners(body);
    const center = getBodyCenter(body);
    const currentArea = Math.abs(polygonArea(corners));
    const pressure = (body.restArea - currentArea) * AREA_STIFFNESS;

    for (let i = 0; i < corners.length; i++) {
        const corner = corners[i];
        const dx = corner.x - center.x;
        const dy = corner.y - center.y;
        const distance = Math.max(Math.hypot(dx, dy), 0.0001);
        corner.fx += (dx / distance) * pressure;
        corner.fy += (dy / distance) * pressure;
    }
};

const applyWindForce = (body) => {
    if (!gravityModeActive || (dragState && dragState.body === body) || windActivity < 0.02) {
        return;
    }

    const center = getBodyCenter(body);
    const dx = windCursor.x - center.x;
    const dy = windCursor.y - center.y;
    const distance = Math.max(Math.hypot(dx, dy), 1);
    if (distance > WIND_RADIUS) {
        return;
    }

    const influence = (1 - (distance / WIND_RADIUS)) * windActivity;
    const forceX = -(dx / distance) * influence * WIND_FORCE;
    const forceY = -(dy / distance) * influence * WIND_FORCE * 0.18;

    body.nodes.forEach((node) => {
        node.fx += forceX / body.nodes.length;
        node.fy += forceY / body.nodes.length;
    });

    if (influence > 0.08) {
        wakeBody(body);
    }
};

const applyDragForce = (dt) => {
    if (!dragState) {
        return;
    }

    const body = dragState.body;
    const center = getBodyCenter(body);
    const offset = rotateVector(dragState.localGrabX, dragState.localGrabY, body.angle);
    const grabPoint = {
        x: center.x + offset.x,
        y: center.y + offset.y,
    };
    const linearVelocity = getBodyLinearVelocity(body);
    const pointVelocity = {
        x: linearVelocity.x - (body.angularVelocity * offset.y),
        y: linearVelocity.y + (body.angularVelocity * offset.x),
    };
    const dx = dragState.targetX - grabPoint.x;
    const dy = dragState.targetY - grabPoint.y;
    const forceX = (dx * DRAG_STIFFNESS) - (pointVelocity.x * DRAG_DAMPING) + (dragState.velocityX * body.mass * 0.18);
    const forceY = (dy * DRAG_STIFFNESS) - (pointVelocity.y * DRAG_DAMPING) + (dragState.velocityY * body.mass * 0.18);

    body.nodes.forEach((node) => {
        node.fx += forceX / body.nodes.length;
        node.fy += forceY / body.nodes.length;
    });

    body.angularVelocity += clamp(
        ((offset.x * forceY) - (offset.y * forceX)) / body.inertia * dt,
        -MAX_ANGULAR_SPEED,
        MAX_ANGULAR_SPEED
    );
};

const integrateNode = (node, dt) => {
    node.vx += (node.fx / node.mass) * dt;
    node.vy += (node.fy / node.mass) * dt;
    node.vx *= NODE_DAMPING;
    node.vy *= NODE_DAMPING;
    const speed = Math.hypot(node.vx, node.vy);
    if (speed > MAX_NODE_SPEED) {
        const scale = MAX_NODE_SPEED / speed;
        node.vx *= scale;
        node.vy *= scale;
    }
    node.x += node.vx * dt;
    node.y += node.vy * dt;
    node.fx = 0;
    node.fy = 0;
};

const resolveNodeBoundary = (node) => {
    let touched = false;

    if (node.x < 0) {
        node.x = 0;
        if (node.vx < 0) {
            node.vx = -node.vx * WALL_RESTITUTION;
        }
        node.vy *= SURFACE_FRICTION;
        touched = true;
    } else if (node.x > gravityWorldWidth) {
        node.x = gravityWorldWidth;
        if (node.vx > 0) {
            node.vx = -node.vx * WALL_RESTITUTION;
        }
        node.vy *= SURFACE_FRICTION;
        touched = true;
    }

    if (node.y < 0) {
        node.y = 0;
        if (node.vy < 0) {
            node.vy = -node.vy * WALL_RESTITUTION;
        }
        node.vx *= SURFACE_FRICTION;
        touched = true;
    } else if (node.y > gravityFloorY) {
        node.y = gravityFloorY;
        if (node.vy > 0) {
            node.vy = -node.vy * FLOOR_RESTITUTION;
        }
        node.vx *= SURFACE_FRICTION;
        touched = true;
    }

    return touched;
};

const stabilizeBody = (body) => {
    const center = getBodyCenter(body);
    const centerNode = body.nodes[4];
    const dx = center.x - centerNode.x;
    const dy = center.y - centerNode.y;

    centerNode.x += dx * 0.18;
    centerNode.y += dy * 0.18;
    centerNode.vx += dx * 0.24;
    centerNode.vy += dy * 0.24;
};

const resolveBodyCollision = (a, b) => {
    const collision = getBodyCollision(a, b);
    if (!collision) {
        return;
    }

    wakeBody(a);
    wakeBody(b);
    a.contacting = true;
    b.contacting = true;

    const aMass = getBodyMass(a);
    const bMass = getBodyMass(b);
    const totalMass = aMass + bMass;
    const normal = collision.normal;
    const overlap = collision.overlap;
    const aSupport = getSupportNodeIndices(a, normal);
    const bSupport = getSupportNodeIndices(b, { x: -normal.x, y: -normal.y });

    const aPush = (bMass / totalMass) * overlap;
    const bPush = (aMass / totalMass) * overlap;
    const bodyPushA = aPush * BODY_TRANSLATION_SHARE;
    const bodyPushB = bPush * BODY_TRANSLATION_SHARE;
    const contactPushA = (aPush * CONTACT_TRANSLATION_SHARE) / aSupport.length;
    const contactPushB = (bPush * CONTACT_TRANSLATION_SHARE) / bSupport.length;

    translateBody(a, -normal.x * bodyPushA, -normal.y * bodyPushA);
    translateBody(b, normal.x * bodyPushB, normal.y * bodyPushB);

    aSupport.forEach((index) => {
        a.nodes[index].x -= normal.x * contactPushA;
        a.nodes[index].y -= normal.y * contactPushA;
    });
    bSupport.forEach((index) => {
        b.nodes[index].x += normal.x * contactPushB;
        b.nodes[index].y += normal.y * contactPushB;
    });

    const velocityA = averageVelocity(a, aSupport);
    const velocityB = averageVelocity(b, bSupport);
    const relativeVelocity = {
        x: velocityB.x - velocityA.x,
        y: velocityB.y - velocityA.y,
    };
    const relativeNormal = (relativeVelocity.x * normal.x) + (relativeVelocity.y * normal.y);
    if (relativeNormal >= 0) {
        return;
    }

    const inverseMass = (1 / aMass) + (1 / bMass);
    const normalImpulseMagnitude = (-(1 + BODY_RESTITUTION) * relativeNormal) / inverseMass;
    const tangent = { x: -normal.y, y: normal.x };
    const relativeTangent = (relativeVelocity.x * tangent.x) + (relativeVelocity.y * tangent.y);
    const tangentImpulseMagnitude = clamp(
        (-relativeTangent / inverseMass) * BODY_FRICTION,
        -Math.abs(normalImpulseMagnitude),
        Math.abs(normalImpulseMagnitude)
    );

    const impulseX = (normal.x * normalImpulseMagnitude) + (tangent.x * tangentImpulseMagnitude);
    const impulseY = (normal.y * normalImpulseMagnitude) + (tangent.y * tangentImpulseMagnitude);

    applyImpulse(a, aSupport, -impulseX / aSupport.length, -impulseY / aSupport.length);
    applyImpulse(b, bSupport, impulseX / bSupport.length, impulseY / bSupport.length);
};

const stepSoftBodies = (dt) => {
    const substep = dt / SOLVER_SUBSTEPS;

    for (let step = 0; step < SOLVER_SUBSTEPS; step++) {
        gravityBodies.forEach((body) => {
            body.contacting = false;
            if (body.sleeping && (!dragState || dragState.body !== body)) {
                return;
            }

            body.nodes.forEach((node) => {
                node.fx = 0;
                node.fy = node.mass * GRAVITY_ACCEL;
            });
            applySpringForces(body);
            applyAreaForce(body);
            applyWindForce(body);
        });

        applyDragForce(substep);

        gravityBodies.forEach((body) => {
            if (body.sleeping && (!dragState || dragState.body !== body)) {
                return;
            }

            body.nodes.forEach((node) => {
                integrateNode(node, substep);
                if (resolveNodeBoundary(node)) {
                    body.contacting = true;
                }
            });
            stabilizeBody(body);
            body.angularVelocity = clamp(body.angularVelocity * ANGULAR_DAMPING, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);
            body.angle += body.angularVelocity * substep;
        });

        for (let pass = 0; pass < COLLISION_PASSES; pass++) {
            gravityBodies.forEach((body) => {
                if (body.sleeping && (!dragState || dragState.body !== body)) {
                    return;
                }

                body.nodes.forEach((node) => {
                    if (resolveNodeBoundary(node)) {
                        body.contacting = true;
                    }
                });
            });

            for (let i = 0; i < gravityBodies.length; i++) {
                for (let j = i + 1; j < gravityBodies.length; j++) {
                    resolveBodyCollision(gravityBodies[i], gravityBodies[j]);
                }
            }

            gravityBodies.forEach(stabilizeBody);
        }

        gravityBodies.forEach((body) => {
            if (dragState && dragState.body === body) {
                wakeBody(body);
                return;
            }

            const linearVelocity = getBodyLinearVelocity(body);
            const linearSpeed = Math.hypot(linearVelocity.x, linearVelocity.y);
            const angularSpeed = Math.abs(body.angularVelocity);

            if (body.contacting && linearSpeed < SLEEP_LINEAR_SPEED && angularSpeed < SLEEP_ANGULAR_SPEED) {
                body.sleepFrames += 1;
                if (body.sleepFrames >= SLEEP_FRAMES) {
                    body.sleeping = true;
                    body.angularVelocity = 0;
                    setBodyPose(body, getBodyCenter(body));
                }
            } else {
                wakeBody(body);
            }
        });
    }
};

const physics = (time) => {
    if (!gravityModeActive) {
        return;
    }

    gravityWorldWidth = window.innerWidth;

    if (!gravityPrevTime) {
        gravityPrevTime = time;
    }

    const frameTime = Math.min((time - gravityPrevTime) / 1000, MAX_FRAME_TIME);
    gravityPrevTime = time;
    gravityAccumulator += frameTime;

    while (gravityAccumulator >= FIXED_STEP) {
        stepSoftBodies(FIXED_STEP);
        gravityAccumulator -= FIXED_STEP;
    }

    windActivity *= WIND_ACTIVITY_DECAY;
    gravityBodies.forEach(updateBodyTransform);
    gravityFrame = requestAnimationFrame(physics);
};

const pickDragNode = (body, pointX, pointY) => {
    let closestIndex = 4;
    let closestDistance = Infinity;

    body.nodes.forEach((node, index) => {
        const dx = node.x - pointX;
        const dy = node.y - pointY;
        const distance = (dx * dx) + (dy * dy);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
        }
    });

    return closestIndex;
};

const onGravityPointerMove = (event) => {
    if (!gravityModeActive) {
        return;
    }

    const pageX = event.clientX + window.scrollX;
    const pageY = event.clientY + window.scrollY;
    windCursor = { x: pageX, y: pageY };
    windActivity = 1;

    if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
    }

    const now = performance.now();
    const dt = Math.max((now - dragState.lastTime) / 1000, 1 / 240);
    const velocityX = clamp((pageX - dragState.lastX) / dt, -POINTER_VELOCITY_LIMIT, POINTER_VELOCITY_LIMIT);
    const velocityY = clamp((pageY - dragState.lastY) / dt, -POINTER_VELOCITY_LIMIT, POINTER_VELOCITY_LIMIT);

    dragState.targetX = pageX;
    dragState.targetY = pageY;
    dragState.velocityX = velocityX;
    dragState.velocityY = velocityY;
    dragState.lastX = pageX;
    dragState.lastY = pageY;
    dragState.lastTime = now;
};

const releaseGravityDrag = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
    }

    wakeBody(dragState.body);
    dragState.body.nodes.forEach((node) => {
        node.vx += dragState.velocityX * 0.08;
        node.vy += dragState.velocityY * 0.08;
    });
    dragState.body.angularVelocity = clamp(
        dragState.body.angularVelocity + (
            ((dragState.localGrabX * dragState.velocityY) - (dragState.localGrabY * dragState.velocityX)) /
            dragState.body.inertia
        ) * 0.12,
        -MAX_ANGULAR_SPEED,
        MAX_ANGULAR_SPEED
    );
    dragState.body.element.style.cursor = "grab";
    dragState = null;
};

const beginGravityDrag = (body, event) => {
    if (!gravityModeActive || dragState) {
        return;
    }

    event.preventDefault();
    const pageX = event.clientX + window.scrollX;
    const pageY = event.clientY + window.scrollY;
    const center = getBodyCenter(body);
    const localGrab = rotateVector(pageX - center.x, pageY - center.y, -body.angle);

    dragState = {
        body,
        pointerId: event.pointerId,
        targetX: pageX,
        targetY: pageY,
        lastX: pageX,
        lastY: pageY,
        lastTime: performance.now(),
        localGrabX: localGrab.x,
        localGrabY: localGrab.y,
        velocityX: 0,
        velocityY: 0,
    };

    wakeBody(body);
    body.element.style.cursor = "grabbing";
    body.element.setPointerCapture(event.pointerId);
};

const getGravityTargets = () => {
    const targets = [
        query(".gurgle-logo-small"),
        query(".search-box"),
        query(".search-details"),
        query(".ai-overview"),
        ...queryAll(".sidebar-list > li"),
        ...queryAll("#results > .link-block"),
        ...queryAll(".results-images-grid > .image-result-card"),
        query("#results-footer"),
    ];

    const optionsBar = query("#options-bar");
    if (optionsBar && optionsBar.classList.contains("is-open")) {
        targets.push(optionsBar);
    }

    return [...new Set(targets.filter(Boolean))];
};

const startGravityMode = () => {
    if (gravityModeActive) {
        return;
    }

    gravityModeActive = true;
    document.body.classList.add("gravity-mode");
    gravityFloorY = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, window.innerHeight);
    gravityWorldWidth = window.innerWidth;
    document.body.style.minHeight = `${gravityFloorY}px`;
    gravityBodies = [];
    gravityAccumulator = 0;
    gravityPrevTime = 0;

    gravityLayer = document.createElement("div");
    gravityLayer.className = "gravity-layer";
    gravityLayer.style.height = `${gravityFloorY}px`;
    document.body.appendChild(gravityLayer);

    const targets = getGravityTargets()
        .map((element) => ({
            element,
            rect: element.getBoundingClientRect(),
        }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0);

    targets.forEach(({ element, rect }) => {
        const pageLeft = rect.left + window.scrollX;
        const pageTop = rect.top + window.scrollY;
        const body = createSoftBody(element, pageTop, pageLeft, rect.width, rect.height);

        gravityLayer.appendChild(element);
        element.style.position = "absolute";
        element.style.left = "0";
        element.style.top = "0";
        element.style.margin = "0";
        element.style.listStyle = "none";
        element.style.boxSizing = "border-box";
        element.style.width = `${rect.width}px`;
        element.style.height = `${rect.height}px`;
        element.style.transformOrigin = "50% 50%";
        element.style.willChange = "transform";
        element.style.cursor = "grab";
        element.style.touchAction = "none";
        updateBodyTransform(body);

        element.addEventListener("pointerdown", (event) => {
            beginGravityDrag(body, event);
        });

        gravityBodies.push(body);
    });

    window.addEventListener("pointermove", onGravityPointerMove, { passive: true });
    window.addEventListener("pointerup", releaseGravityDrag);
    window.addEventListener("pointercancel", releaseGravityDrag);
    gravityFrame = requestAnimationFrame(physics);
};

const maybeStartGravityMode = () => {
    if (gravityModeActive) {
        return;
    }

    if (document.querySelector("#results .link-block")) {
        return;
    }

    startGravityMode();
};

const triggerJumpscare = () => {
    const overlay = document.getElementById("jumpscare");
    if (overlay) {
        overlay.style.display = "flex";
        overlay.onclick = () => {
            overlay.style.display = "none";
        };
    }
};

const triggerAmogusSliding = () => {
    setInterval(() => {
        if (Math.random() < 0.5) { 
            const amogus = document.createElement('img');
            amogus.src = 'img/other/amogus.gif';
            const isRtl = Math.random() > 0.5;
            amogus.className = isRtl ? 'amogus-slider amogus-slide-active-rtl' : 'amogus-slider amogus-slide-active';
            document.body.appendChild(amogus);
            setTimeout(() => amogus.remove(), 6000);
        }
    }, 4000);
};

const amogusGhosts = [];
const moveAmogusGhosts = () => {
    amogusGhosts.forEach(g => {
        g.x += g.vx;
        g.y += g.vy;

        // Bounce off walls
        if (g.x < 0 || g.x > window.innerWidth - 40) {
            g.vx *= -1;
            g.x = clamp(g.x, 0, window.innerWidth - 40);
        }
        if (g.y < 0 || g.y > window.innerHeight - 40) {
            g.vy *= -1;
            g.y = clamp(g.y, 0, window.innerHeight - 40);
        }

        // Occasional direction change (Pacman ghost style)
        if (Math.random() < 0.01) {
            const speeds = [-8, -6, 6, 8];
            g.vx = speeds[Math.floor(Math.random() * speeds.length)];
            g.vy = speeds[Math.floor(Math.random() * speeds.length)];
        }

        g.el.style.left = `${g.x}px`;
        g.el.style.top = `${g.y}px`;
    });
    requestAnimationFrame(moveAmogusGhosts);
};

const spawnAmogusGrid = (rect) => {
    const rows = Math.ceil(rect.height / 40);
    const cols = Math.ceil(rect.width / 40);
    const startingCount = amogusGhosts.length;
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const el = document.createElement('img');
            el.src = 'img/other/amogus.gif';
            el.className = 'amogus-ghost';
            const x = rect.left + (c * 40);
            const y = rect.top + (r * 40);
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
            el.style.filter = `hue-rotate(${Math.random() * 360}deg)`;
            document.body.appendChild(el);

            const speeds = [-8, -6, 6, 8];
            amogusGhosts.push({
                el,
                x,
                y,
                vx: speeds[Math.floor(Math.random() * speeds.length)],
                vy: speeds[Math.floor(Math.random() * speeds.length)]
            });
        }
    }
    
    if (startingCount === 0 && amogusGhosts.length > 0) { 
        requestAnimationFrame(moveAmogusGhosts);
    }
};

const explodeAmogus = (x, y) => {
    const count = 15;
    for (let i = 0; i < count; i++) {
        const amogus = document.createElement('img');
        amogus.src = 'img/other/amogus.gif';
        amogus.className = 'amogus-particle';
        amogus.style.left = `${x}px`;
        amogus.style.top = `${y}px`;
        amogus.style.filter = `hue-rotate(${Math.random() * 360}deg)`;
        document.body.appendChild(amogus);

        const angle = Math.random() * Math.PI * 2;
        const dist = 300 + Math.random() * 500;
        const tx = Math.cos(angle) * dist;
        const ty = Math.sin(angle) * dist;

        requestAnimationFrame(() => {
            amogus.style.transform = `translate(${tx}px, ${ty}px) rotate(${Math.random() * 720}deg) scale(0.1)`;
            amogus.style.opacity = '0';
        });

        setTimeout(() => amogus.remove(), 1000);
    }
};

// Global click listener for random explosions
document.addEventListener('mousedown', (e) => {
    if (checkAmogusTrigger() && Math.random() < 0.4) {
        explodeAmogus(e.clientX, e.clientY);
    }
});

const newResultBlock = (title, desc, url, q, id, siteName) => {
    const cleanUrl = url.replace("http://", "https://");
    let urlObj;
    try {
        urlObj = new URL(cleanUrl);
    } catch (e) {
        urlObj = { hostname: url, pathname: "" };
    }

    const resolvedSiteName = siteName || urlObj.hostname.split(".")[0];
    const displayPath = urlObj.pathname.replaceAll("/", " > ").replace(/ > $/, "");
    const displayUrl = urlObj.hostname + displayPath;

    const highlightedSiteName = highlightSearchTerm(resolvedSiteName, q);
    const highlightedDisplayUrl = highlightSearchTerm(displayUrl, q);
    const faviconSrc = pickRandom(resultFaviconPaths);
    const freshnessText = Math.random() < 0.3
        ? (() => {
            const useSeconds = Math.random() < 0.45;
            const value = useSeconds
                ? Math.floor(Math.random() * 55) + 5
                : Math.floor(Math.random() * 58) + 2;
            return `Updated ${value} ${useSeconds ? "seconds" : "minutes"} ago`;
        })()
        : null;
    const descHtml = freshnessText
        ? `<span class="link-freshness">${freshnessText} — </span>${desc}`
        : desc;

    const html = `
        <div class="link-block" id="link-block-${id}">
            <div class="link-header">
                <img class="result-favicon" src="${faviconSrc}" alt="" aria-hidden="true">
                <div class="link-text">
                    <span class="site-name">${highlightedSiteName}</span>
                    <small class="link-url">https://${highlightedDisplayUrl}</small>
                </div>
            </div>
            <a href="${cleanUrl}" class="link-title">${title}</a>
            <span class="link-desc">${descHtml}</span>
        </div>
    `;

    const block = new DOMParser()
        .parseFromString(html, "text/html")
        .body.firstChild;

    // Jumpscare trigger detection
    const isSpeedBarking = /(speed.*barking|barking.*speed|ishowspeed)/i.test(q);
    const isAmogus = checkAmogusTrigger();

    block.querySelector(".link-title").addEventListener("click", (event) => {
        event.preventDefault();
        if (gravityModeActive) {
            return;
        }

        if (isAmogus) {
            const rect = block.getBoundingClientRect();
            spawnAmogusGrid(rect);
        }

        if (isSpeedBarking) {
            triggerJumpscare();
            return;
        }

        if (Math.random() < 0.15) {
            startGravityMode();
            return;
        }
        playResultAnimation(block);
    });

    return block;
};

const loadResultsFromUrl = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error("Network response was not ok");
        }
        return await response.json();
    } catch (error) {
        console.error("Fetch error:", error);
        return null;
    }
};

const loadQueriesFromUrl = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error("Network response was not ok");
        }
        const data = await response.text();
        return data.split("\n");
    } catch (error) {
        console.error("Fetch error:", error);
        return null;
    }
};

const flatten = (str) => str.toLowerCase().replace(/[^0-9a-z]/g, "");

const getSearchTerm = (queries, tabIndex) => {
    let i = parseInt(tabIndex || currentTabIndex, 10);
    switch (i) {
        case 4:
            return "fancy hot dogs";
        case 5:
            return "used cars";
        default:
            return queries[Math.floor(Math.random() * queries.length)];
    }
};

const highlightSearchTerm = (text, searchTerm) => {
    if (!searchTerm) {
        return text;
    }
    let escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|[^0-9A-Za-z])(${escapedTerm})(?=$|[^0-9A-Za-z])`, "g");
    return text.replace(regex, (_, prefix, match) => `${prefix}<b>${match}</b>`);
};

const resultAnimationPool = [
    {
        name: "explode",
        keyframes: [
            { transform: "scale(1)", opacity: 1, filter: "blur(0px)" },
            { transform: "scale(1.1)", opacity: 1, filter: "blur(0px)" },
            { transform: "scale(1.35) rotate(6deg)", opacity: 0, filter: "blur(8px)" },
        ],
    },
    {
        name: "snap",
        keyframes: [
            { transform: "scale(1)", opacity: 1, filter: "blur(0px)" },
            { transform: "scale(0.92)", opacity: 0.7, filter: "blur(1px)" },
            { transform: "scale(0.45) translateX(12px)", opacity: 0, filter: "blur(10px)" },
        ],
    },
    {
        name: "fall",
        keyframes: [
            { transform: "translateY(0) rotate(0deg)", opacity: 1 },
            { transform: "translateY(12px) rotate(2deg)", opacity: 1 },
            { transform: "translateY(120px) rotate(14deg)", opacity: 0 },
        ],
    },
    {
        name: "fade",
        keyframes: [
            { transform: "scale(1)", opacity: 1, filter: "blur(0px)" },
            { transform: "scale(0.98)", opacity: 0.5, filter: "blur(0px)" },
            { transform: "scale(0.96)", opacity: 0, filter: "blur(2px)" },
        ],
    },
    {
        name: "wiggle",
        keyframes: [
            { transform: "translateX(0) rotate(0deg)", opacity: 1 },
            { transform: "translateX(-6px) rotate(-2deg)", opacity: 1 },
            { transform: "translateX(6px) rotate(2deg)", opacity: 1 },
            { transform: "translateX(24px) rotate(8deg)", opacity: 0 },
        ],
    },
];

const playResultAnimation = (block) => {
    if (!block || block.classList.contains("result-animating")) {
        return;
    }

    const animation = resultAnimationPool[Math.floor(Math.random() * resultAnimationPool.length)];
    block.classList.add("result-animating");
    block.style.transformOrigin = "center center";
    block.style.pointerEvents = "none";
    block.style.willChange = "transform, opacity, filter";

    const animationHandle = block.animate(animation.keyframes, {
        duration: animation.name === "wiggle" ? 520 : 420,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        fill: "forwards",
    });

    animationHandle.onfinish = () => {
        block.remove();
        maybeStartGravityMode();
    };
};

const formatSearchCount = () => {
    const leadingPair = Math.floor(Math.random() * 50) + 10;
    return (leadingPair * 1000000).toLocaleString();
};

const formatSearchSeconds = () => {
    const baseSeconds = 0.05;
    const jitter = (Math.random() * 3) - 1.5;
    const seconds = Math.max(0.01, baseSeconds + jitter);
    return seconds.toFixed(2);
};

const buildAiOverviewCopy = (query) => {
    const cleanQuery = ((query || "").trim() || "this topic");
    const label = cleanQuery.charAt(0).toUpperCase() + cleanQuery.slice(1);
    const comparisonQuery = /\b(vs\.?|versus|or)\b/i.test(cleanQuery);
    const questionIntentMatch = cleanQuery.match(/\b(what|why|where|how|when)\b/i);
    const questionIntent = questionIntentMatch ? questionIntentMatch[1].toLowerCase() : null;
    const mentionTerm = Math.random() < 0.6 ? `about ${cleanQuery}` : "about whatever you just typed";
    const matchSpecial = questionSpecial.find((candidate) => candidate.pattern.test(cleanQuery));

    if (matchSpecial) {
        const value = Math.floor(Math.random() * 40) + 55;
        const hooks = [
            "The algorithm answers with a front-page sass bucket",
            "It doesn't even pretend to be gentle with the truth",
            "Reddit-level roast energy comes through the summary",
            "Instagram dark humor is layered under the pseudo-analysis",
        ];
        const closers = [
            "It then delivers a probability-laced verdict with zero shame",
            "Next it drops a statistic so smug it feels like a thread top comment",
            "After that comes a brutal little note about how reality probably disagrees",
            "It finishes with a wink and a 'deal with it' style toss-in",
        ];
        return {
            firstSentence: `${pickRandom(hooks)} — ${probabilityPhrase(value, matchSpecial.theme)}.`,
            rest: `${pickRandom(closers)} ${pickRandom([
                "So now you're armed with a savage statistic.",
                "This is why the answer feels smart and shockingly mean.",
                "It sounds like a data-backed burn, which is the point.",
            ])}`,
        };
    }

    if (comparisonQuery) {
        return {
            firstSentence: `${label} ${pickRandom([
                "usually gets compressed into a tradeoff story",
                "is often flattened into a side-by-side decision",
                "normally gets framed as a personality test with consequences",
                "keeps being summarized as a neat binary choice",
            ])} where ${pickRandom([
                "the loudest difference pretends to be the whole answer",
                "one practical detail ends up steering the entire conclusion",
                "vibes get promoted to evidence surprisingly quickly",
                "the obvious contrast hides the messier reality underneath",
            ])}.`,
            rest: `${pickRandom([
                "Most overview engines then",
                "The summary layer usually",
                "A fake authority paragraph will often",
                "This kind of answer system tends to",
            ])} ${pickRandom([
                `blend examples, habits, and half-true generalizations around ${cleanQuery}`,
                `stitch together convenience, identity, and side arguments about ${cleanQuery}`,
                `smooth over the weird parts of ${cleanQuery} with confident-sounding transitions`,
                `package ${cleanQuery} as if one chart could settle it`,
            ])}, which makes the explanation look settled before the source pages actually agree. ${pickRandom([
                `That is why ${cleanQuery} ends up sounding clearer than it really is.`,
                `So ${cleanQuery} usually reads as solved even when it is just neatly rearranged.`,
                `The result is that ${cleanQuery} appears definitive while still being mostly organized guesswork.`,
            ])}`,
        };
    }

    if (questionIntent) {
        const starter = pickRandom(introStabs);
        const mid = pickRandom(midWeaves);
        const final = pickRandom(punchlines);
        const intentTag = questionPoolData[questionIntent] || questionPoolData.default || [];
        const intentFragment = pickRandom(intentTag);
        const mentionClause = Math.random() < 0.5
            ? `Throw in ${mentionTerm} just for context`
            : "It still smuggles in just enough context";
        return {
            firstSentence: `${starter} ${intentFragment} ${mid}. ${mentionClause}.`,
            rest: `${pickRandom([
                `${cleanQuery} is then deployed with a mix of math-sounding nonsense and meme-laced bravado`,
                `The next line drops a corny statistic plus a wink to a Reddit crowd`,
                `It keeps the tone unpredictable, like someone scribbling in the comments scroll`,
            ])} ${final}`,
        };
    }

    return {
        firstSentence: `${label} ${pickRandom([
            "is currently being treated like a high-confidence concept",
            "usually gets explained as if the main pattern is already obvious",
            "keeps getting summarized with suspicious levels of certainty",
            "is often described through a very calm paragraph that sounds smarter than it is",
        ])}, and ${pickRandom([
            "that tends to make the first explanation feel cleaner than the source material",
            "that is why the quick answer sounds polished before it sounds specific",
            "that usually turns a messy topic into something weirdly well-behaved",
            "that is how vague context suddenly starts looking authoritative",
        ])}.`,
        rest: `${pickRandom([
            "Most answer summaries then",
            "The usual overview pattern is to",
            "A fake-smart explanation will typically",
            "What happens next is that the summary layer",
        ])} ${pickRandom([
            `blend context, examples, and social residue around ${cleanQuery}`,
            `stack adjacent ideas on top of ${cleanQuery} until it feels complete`,
            `turn ${cleanQuery} into a smooth chain of assumptions, examples, and soft warnings`,
            `repackage ${cleanQuery} as a sequence of obvious points with very few useful boundaries`,
        ])}. ${pickRandom([
            `That is why ${cleanQuery} often sounds more resolved than the pages below it.`,
            `So ${cleanQuery} ends up looking stable even when the evidence is mostly vibes plus formatting.`,
            `The end result is that ${cleanQuery} appears straightforward right before the details start getting strange.`,
        ])}`,
    };
};

const newAiOverviewBlock = (query) => {
    const copy = buildAiOverviewCopy(query);
    const highlightedFirstSentence = highlightSearchTerm(copy.firstSentence, query);
    const highlightedRest = highlightSearchTerm(copy.rest, query);

    const overviewIcon = pickRandom(overviewIconPaths);
    const html = `
        <section class="ai-overview" aria-label="AI Overview">
            <div class="ai-overview-head">
                <img class="ai-overview-icon" src="${overviewIcon}" alt="" aria-hidden="true">
                <span class="ai-overview-title" title="Absolute Idiot">AI Overview</span>
            </div>
            <p class="ai-overview-copy">
                <span class="ai-overview-highlight">${highlightedFirstSentence}</span> ${highlightedRest}
            </p>
            <hr class="ai-overview-divider">
        </section>
    `;

    return new DOMParser()
        .parseFromString(html, "text/html")
        .body.firstChild;
};

const imagePreviewPanel = (() => {
    const panel = document.createElement("div");
    panel.className = "image-preview-panel";
    panel.innerHTML = `
        <div class="image-preview-panel-meta">
            <div class="image-preview-meta-text">
                <a class="image-preview-link" target="_blank" rel="noreferrer noopener">
                    <strong class="image-preview-title"></strong>
                </a>
                <span class="image-preview-service"></span>
            </div>
            <div class="image-preview-meta-actions">
                <button type="button" class="image-preview-close" aria-label="Close preview">&times;</button>
            </div>
        </div>
        <div class="image-preview-img-wrap">
            <img class="image-preview-img" alt="" loading="lazy">
        </div>
    `;

    const appendPanel = () => {
        if (!document.body.contains(panel)) {
            document.body.appendChild(panel);
        }
    };

    if (document.body) {
        appendPanel();
    } else {
        document.addEventListener("DOMContentLoaded", appendPanel, { once: true });
    }

    return {
        panel,
        imageEl: panel.querySelector(".image-preview-img"),
        titleEl: panel.querySelector(".image-preview-title"),
        serviceEl: panel.querySelector(".image-preview-service"),
        linkEl: panel.querySelector(".image-preview-link"),
        closeButton: panel.querySelector(".image-preview-close"),
    };
})();

const showImagePreview = (item) => {
    if (!item) {
        return;
    }
    imagePreviewPanel.imageEl.src = item.src;
    imagePreviewPanel.imageEl.alt = item.title;
    imagePreviewPanel.titleEl.textContent = item.title;
    imagePreviewPanel.serviceEl.textContent = item.service;
    imagePreviewPanel.linkEl.href = item.href;
    imagePreviewPanel.panel.classList.add("is-visible");
};

const hideImagePreview = () => {
    imagePreviewPanel.panel.classList.remove("is-visible");
};

imagePreviewPanel.closeButton.addEventListener("click", hideImagePreview);
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" || event.key === "Esc") {
        hideImagePreview();
    }
});

const newImageResultCard = (item, id) => {
    const html = `
        <a class="image-result-card" id="image-result-${id}" href="${item.href}" target="_blank" rel="noreferrer noopener">
            <div class="image-result-thumb-wrap">
                <img class="image-result-thumb" src="${item.src}" alt="${item.title}" loading="lazy" referrerpolicy="no-referrer">
            </div>
            <span class="image-result-title">${item.title}</span>
            <small class="image-result-meta">${item.service}</small>
        </a>
    `;

    const card = new DOMParser()
        .parseFromString(html, "text/html")
        .body.firstChild;

    card.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }
        event.preventDefault();
        showImagePreview(item);
    });

    return card;
};

const renderImageResults = () => {
    const grid = document.createElement("div");
    grid.className = "results-images-grid";

    const shuffledItems = [...unhingedImagePool];
    shuffle(shuffledItems);
    shuffledItems.slice(0, 10).forEach((item, index) => {
        grid.appendChild(newImageResultCard(item, index));
    });

    resultsContainer.appendChild(grid);
    resultsContainer.insertAdjacentHTML("beforeend", gurgle_footer);
};

const clearRenderedResults = () => {
    queryAll("#results > *").forEach((child) => {
        if (!child.classList.contains("below-search-bar")) {
            child.remove();
        }
    });
};

const syncResultsChrome = () => {
    const detailsWrap = query(".below-search-bar");
    const searchDetails = query(".search-details");
    const optionsBar = query("#options-bar");
    const isImagesTab = currentTabIndex === 2;

    if (detailsWrap) {
        detailsWrap.hidden = isImagesTab;
    }

    if (searchDetails) {
        searchDetails.hidden = isImagesTab;
    }

    if (optionsBar) {
        if (isImagesTab) {
            optionsBar.classList.remove("is-open");
        }
        optionsBar.hidden = isImagesTab;
    }
};

const renderResults = (results, q) => {
    if (!resultsContainer || !searchCountElement) {
        return;
    }

    clearRenderedResults();
    resultsContainer.classList.toggle("images-mode", currentTabIndex === 2);
    syncResultsChrome();

    if (currentTabIndex !== 2) {
        searchCountElement.textContent = `About ${formatSearchCount()} results (${formatSearchSeconds()} seconds)`;
    } else {
        searchCountElement.textContent = "";
    }

    if (currentTabIndex === 2) {
        renderImageResults();
        return;
    }

    if (currentTabIndex === 1) {
        resultsContainer.appendChild(newAiOverviewBlock(q));
    }

    const shuffledResults = [...results];
    shuffle(shuffledResults);

    shuffledResults.forEach((result) => {
        let title = highlightSearchTerm(result.title.replaceAll("{}", q), q);
        let desc = highlightSearchTerm(result.desc.replaceAll("{}", q), q);
        let rawUrl = result.url.replace("[]", flatten(q));
        let id = resultsContainer.childElementCount;
        resultsContainer.appendChild(newResultBlock(
            title,
            desc,
            rawUrl,
            q,
            id,
            result.site_name
        ));
    });

    resultsContainer.insertAdjacentHTML("beforeend", gurgle_footer);
};

const toggleSearchOptions = (event) => {
    event.preventDefault();
    const bar = fromId("options-bar");
    bar.classList.toggle("is-open");
};

const clearIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M6.4 19L5 17.6l5.6-5.6L5 6.4L6.4 5l5.6 5.6L17.6 5L19 6.4L13.4 12l5.6 5.6l-1.4 1.4l-5.6-5.6z"/></svg>`;
const searchIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14"/></svg>`;

const syncSearchActionButtons = (input, searchButton, clearButton) => {
    const hasValue = input.value.trim().length > 0;
    searchButton.type = "submit";
    searchButton.setAttribute("aria-label", "Search");
    searchButton.innerHTML = searchIconSvg;
    clearButton.style.display = hasValue ? "flex" : "none";
};

const syncSidebarLinks = (q) => {
    const safeQ = q || "";
    queryAll(".sidebar-list > li > a").forEach((link) => {
        const url = new URL(link.getAttribute("href"), window.location.href);
        url.searchParams.set("prev_i", currentTabIndex);
        if (safeQ) {
            url.searchParams.set("q", safeQ);
        } else {
            url.searchParams.delete("q");
        }
        link.href = url.pathname + url.search;
    });
};

const getTabIndicatorMetrics = (link) => {
    const sidebarList = query(".sidebar-list");
    if (!sidebarList || !link) {
        return null;
    }

    const listRect = sidebarList.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    return {
        left: `${linkRect.left - listRect.left}px`,
        width: `${linkRect.width}px`,
    };
};

const setTabIndicator = (link) => {
    const metrics = getTabIndicatorMetrics(link);
    if (!metrics) {
        return;
    }

    const sidebarList = query(".sidebar-list");
    sidebarList.style.setProperty("--tab-indicator-left", metrics.left);
    sidebarList.style.setProperty("--tab-indicator-width", metrics.width);
};

const getLinkTabIndex = (link) => {
    const datasetIndex = parseInt(link.dataset.tabOrder, 10);
    if (!Number.isNaN(datasetIndex)) {
        return datasetIndex;
    }
    return parseInt(link.id.replace("sidebar-item-", ""), 10);
};

const findTabLink = (index) => query(`.sidebar-list > li > a[data-tab-order="${index}"]`);

const applyActiveTab = (tabIndex) => {
    currentTabIndex = tabIndex;
    queryAll(".sidebar-list > li > a").forEach((link) => {
        link.classList.toggle("selected", getLinkTabIndex(link) === tabIndex);
    });
    const selectedTab = findTabLink(tabIndex);
    if (selectedTab) {
        setTabIndicator(selectedTab);
    }
};

const updateResultsUrl = (tabIndex, q, previousTabIndex) => {
    const url = new URL(window.location.href);
    url.searchParams.set("i", tabIndex);
    url.searchParams.set("prev_i", previousTabIndex);
    if (q) {
        url.searchParams.set("q", q);
    } else {
        url.searchParams.delete("q");
    }
    window.history.pushState({ i: tabIndex, q, prev_i: previousTabIndex }, "", `${url.pathname}${url.search}${url.hash}`);
};

const refreshResultsContent = async (tabIndex, q) => {
    if (!cachedResults || !cachedQueries) {
        return;
    }

    applyActiveTab(tabIndex);
    syncSidebarLinks(q);
    renderResults(cachedResults, q || getSearchTerm(cachedQueries, tabIndex));
};

const navigateTabInPlace = async (targetLink) => {
    const nextTabIndex = getLinkTabIndex(targetLink);
    const nextQuery = currentSearchTerm || fromId("q").value.trim() || getSearchTerm(cachedQueries, nextTabIndex);
    const previousTabIndex = currentTabIndex;

    updateResultsUrl(nextTabIndex, nextQuery, previousTabIndex);
    await refreshResultsContent(nextTabIndex, nextQuery);
    syncSidebarLinks(nextQuery);
};

const init = async () => {
    cachedResults = await loadResultsFromUrl("data/fake_index.json");
    cachedQueries = await loadQueriesFromUrl("data/fake_queries.csv");
    resultsContainer = fromId("results");
    searchCountElement = fromId("search-count");

    if (!cachedResults || !cachedQueries) {
        return;
    }

    currentSearchTerm = currentSearchTerm || getSearchTerm(cachedQueries, currentTabIndex);
    applyActiveTab(currentTabIndex);

    const searchInput = fromId("q");
    const searchButton = document.querySelector(".search-actions > button");
    const searchActions = document.querySelector(".search-actions");
    const clearButton = document.createElement("button");
    searchInput.value = url_params.q || "";
    fromId("search-options").addEventListener("click", toggleSearchOptions);

    clearButton.type = "button";
    clearButton.className = "search-clear-button";
    clearButton.setAttribute("aria-label", "Clear search");
    clearButton.innerHTML = clearIconSvg;
    clearButton.addEventListener("click", () => {
        searchInput.value = "";
        searchInput.focus();
        syncSidebarLinks("");
        syncSearchActionButtons(searchInput, searchButton, clearButton);
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    searchActions.insertBefore(clearButton, searchButton);

    queryAll(".sidebar-list > li > a").forEach((link, index) => {
        link.dataset.tabOrder = `${index + 1}`;
        link.addEventListener("click", (event) => {
            event.preventDefault();
            if (link.classList.contains("selected")) {
                return;
            }
            navigateTabInPlace(link);
        });
    });

    syncSidebarLinks(currentSearchTerm || searchInput.value.trim());
    syncSearchActionButtons(searchInput, searchButton, clearButton);
    searchInput.addEventListener("input", () => {
        const currentValue = searchInput.value.trim();
        currentSearchTerm = currentValue || currentSearchTerm;
        syncSidebarLinks(currentValue || currentSearchTerm);
        syncSearchActionButtons(searchInput, searchButton, clearButton);
    });

    setupAutocomplete(searchInput, ".autocomplete-container");

    const header = query(".results-header");
    window.addEventListener("scroll", () => {
        if (window.scrollY > 20) {
            header.classList.add("scrolled");
        } else {
            header.classList.remove("scrolled");
        }
    });

    const previousTabIndex = parseInt(url_params.prev_i || "", 10);
    const selectedTab = findTabLink(currentTabIndex);
    if (!Number.isNaN(previousTabIndex) && previousTabIndex > 0 && previousTabIndex !== currentTabIndex) {
        const previousTab = findTabLink(previousTabIndex);
        if (previousTab) {
            setTabIndicator(previousTab);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setTabIndicator(selectedTab);
                });
            });
        } else {
            setTabIndicator(selectedTab);
        }
    } else {
        setTabIndicator(selectedTab);
    }

    if (checkAmogusTrigger()) {
        triggerAmogusSliding();
    }

    renderResults(cachedResults, currentSearchTerm);
};

window.addEventListener("DOMContentLoaded", async () => {
    await init();
});

window.addEventListener("popstate", async () => {
    const params = new URLSearchParams(window.location.search);
    const tabIndex = parseInt(params.get("i") || "1", 10);
    const q = params.get("q") || currentSearchTerm || getSearchTerm(cachedQueries, tabIndex);
    currentSearchTerm = q;
    await refreshResultsContent(tabIndex, q);
});
