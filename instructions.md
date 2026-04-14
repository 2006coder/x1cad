# x1cad — Production-Grade Self-Hosted Browser CAD Web Application

## Full Development Prompt

---

### PROJECT IDENTITY

**Name:** x1cad
**Type:** Self-hosted, production-grade, browser-based 3D CAD web application
**Tagline:** Professional CAD in your browser, AI-assisted 3D generation on your GPU
**Distribution:** Users download, install, and run locally on their own machine

---

### CORE PHILOSOPHY

**CAD-first.** The manual CAD engine is the heart of x1cad. It must be richer, smoother, and more capable than TinkerCAD in every dimension — more shapes, more operations, more precision, more control. AI generation is a powerful but optional secondary feature that gracefully enables or disables based on hardware. When AI is off, the app must still be a **world-class CAD tool** consuming minimal system resources.

---

### RESOURCE BUDGETS

```
WITHOUT AI (CAD-only mode):
  System RAM:  < 800MB backend idle, < 1.5GB under heavy modeling
  GPU VRAM:    WebGL only (~200-500MB, browser-managed)
  CPU:         Minimal idle, spikes only during Boolean/mesh operations
  Disk:        ~200MB app + user project files

WITH AI GENERATION ACTIVE (during inference only):
  System RAM:  ≤ 18GB peak (models partially offloaded to RAM)
  GPU VRAM:    ≤ 15GB peak (sequential model loading, FP16, 
               attention slicing, aggressive cleanup between stages)
  Note:        After generation completes, models fully unloaded,
               resources return to CAD-only levels immediately

TARGET SYSTEM:
  32GB system RAM (Windows takes ~4.5GB, leaves ~27GB)
  NVIDIA RTX GPU with ≥16GB VRAM for full AI
  NVIDIA RTX GPU with ≥10GB VRAM for shape-only AI
  Any system for CAD-only (no GPU requirement)
```

---

### HARDWARE DETECTION & AI MODE GATING

On startup the backend must detect hardware and expose capability to the frontend:

```
DETECTION CHECKLIST:
  1. Is NVIDIA GPU present?
  2. Is CUDA runtime available and functional?
  3. Is it an RTX-series card? (compute capability ≥ 7.5)
  4. Total VRAM?
  5. Free VRAM right now?
  6. System RAM total and available?

AI MODE DECISION:
  ┌──────────────────────────────┬──────────────────────────────────┐
  │ Hardware Detected            │ AI Mode                          │
  ├──────────────────────────────┼──────────────────────────────────┤
  │ No NVIDIA GPU                │ DISABLED — CAD fully functional  │
  │ NVIDIA but no CUDA           │ DISABLED                         │
  │ CUDA but not RTX             │ DISABLED (show reason)           │
  │ RTX, VRAM < 10GB             │ DISABLED (show reason)           │
  │ RTX, VRAM 10–14GB            │ SHAPE_ONLY (no texture)          │
  │ RTX, VRAM 15–23GB            │ FULL (sequential, memory-tight)  │
  │ RTX, VRAM ≥ 24GB             │ FULL (comfortable headroom)      │
  └──────────────────────────────┴──────────────────────────────────┘

FRONTEND BEHAVIOR WHEN AI IS DISABLED:
  - AI panel visible but clearly grayed/locked
  - Message: "AI Generation requires NVIDIA RTX GPU with CUDA 
    and ≥10GB VRAM. Detected: [hardware info]"
  - Re-detect button
  - Link to requirements documentation
  - ALL CAD features work perfectly — zero degradation
```

---

### SECTION 1: CAD ENGINE — PRIMITIVE SHAPES

The shape library must be the richest browser CAD shape library available. Every shape is fully parametric — all dimensions editable in the properties panel before and after placement. Parameters update the mesh in real-time as the user types or drags sliders.

#### 1.1 Basic Solids

```
Box / Cube
  width, height, depth
  
Rounded Box (Chamfered Box)
  width, height, depth, cornerRadius, cornerSegments
  
Sphere
  radius, widthSegments (8–128), heightSegments (8–128)
  
Hemisphere / Dome
  radius, segments, flat bottom (cap) toggle
  
Cylinder
  radiusTop, radiusBottom, height, radialSegments, heightSegments
  openEnded toggle (no caps)
  
Cone
  baseRadius, height, radialSegments
  openEnded toggle
  
Torus (Donut)
  majorRadius, tubeRadius, arc (0°–360° for partial torus)
  radialSegments, tubularSegments
  
Capsule
  radius, cylinderLength, capSegments
  
Ellipsoid
  radiusX, radiusY, radiusZ, segments
  
Ring / Washer / Disc
  outerRadius, innerRadius, height (thickness)
  thetaStart, thetaLength for partial ring
```

#### 1.2 Polygonal Prisms

```
Triangular Prism         — circumradius, height
Pentagonal Prism         — circumradius, height
Hexagonal Prism          — circumradius, height
Octagonal Prism          — circumradius, height
N-gonal Prism            — circumradius, height, sides (3–128)
  
All prisms support:
  - inscribed vs circumscribed radius toggle
  - rotation offset (rotate the polygon profile)
  - bevel/chamfer on top and bottom edges (amount, segments)
```

#### 1.3 Pyramids & Tapered Solids

```
Square Pyramid           — baseWidth, baseDepth, height
Triangular Pyramid       — edgeLength (regular tetrahedron), OR baseRadius + height
N-gonal Pyramid          — baseRadius, height, sides (3–128)
Frustum                  — topRadius, bottomRadius, height, sides
Truncated Cone           — topRadius, bottomRadius, height, segments
Wedge / Ramp             — width, height, depth (right-angle triangular profile)
Obelisk                  — topWidth, topDepth, bottomWidth, bottomDepth, height
Bipyramid / Diamond      — radius, topHeight, bottomHeight, sides
```

#### 1.4 Curved & Mathematical Solids

```
Torus Knot               — radius, tube, p, q, radialSegments, tubularSegments
Spring / Helix           — coilRadius, wireRadius, height, turns, 
                           pointsPerTurn, taper (start/end radius multiplier)
Möbius Strip             — radius, width, twists, segments
Supershape (Gielis)      — a, b, m, n1, n2, n3, radius, extrusion depth
Paraboloid               — radius, height, segments
Hyperboloid (one-sheet)  — topRadius, bottomRadius, waistRadius, height, segments
Ogive / Nose Cone        — radius, length, curveType:
                             tangent ogive, secant ogive, Von Kármán,
                             parabolic, power series, Haack series
Catenary Solid           — span, sag, thickness, extrusionDepth
Superellipsoid           — radiusX/Y/Z, exponents e1, e2
```

#### 1.5 Engineering & Mechanical Shapes

```
Spur Gear
  module OR diametral pitch, teeth (6–200), pressureAngle (14.5°/20°/25°),
  thickness, bore diameter, hub diameter, hub thickness,
  addendum, dedendum (auto-calculated or manual override)
  
Helical Gear
  all spur parameters + helixAngle, handed (left/right)
  
Bevel Gear
  teeth, module, faceWidth, shaftAngle, thickness
  
Rack (Linear Gear)
  module, teeth, pressureAngle, height, length
  
Worm Gear
  wormDiameter, wormLength, wormLeadAngle, wormStarts, gearTeeth
  
Thread / Screw Shaft
  majorDiameter, pitch, length, threadDepth,
  threadProfile (triangular/trapezoidal/ACME/buttress/square),
  starts (single/double/triple), handed (right/left)
  Metric presets: M1 through M64 with standard pitch
  Imperial presets: UNC/UNF #0 through 4"
  
Hex Bolt
  standard (M3–M64), OR custom headWidth, headHeight, shaftDiameter, 
  shaftLength, threadLength, threadPitch
  
Hex Nut
  standard (M3–M64), OR custom size, height, threadPitch
  
Socket Head Cap Screw
  standard sizes, OR custom
  
Washer (Flat / Spring / Lock)
  inner diameter, outer diameter, thickness, type
  
Pipe / Tube
  outerDiameter, wallThickness (auto innerDiameter), length
  Schedule presets (SCH 10, 40, 80, etc.)
  
Elbow / Pipe Bend
  pipeDiameter, wallThickness, bendAngle, bendRadius, segments
  
Tee / Cross Fitting
  main pipe diameter, branch diameter, wallThickness
  
Flange (Flat / Weld Neck / Slip-On)
  pipeSize, flangeOD, boltCircleDiameter, boltHoles, thickness
  
Bearing (visual representation)
  innerDiameter, outerDiameter, width, type (ball/roller)
  Standard series presets (6000, 6200, 6300, etc.)
  
Structural Beams (extruded profiles):
  I-Beam / W-Shape     — flangeWidth, flangeThickness, webHeight, 
                          webThickness, length
  C-Channel             — flangeWidth, flangeThickness, webHeight,
                          webThickness, length
  L-Angle               — legA, legB, thickness, length
  T-Beam                — flangeWidth, flangeThickness, stemHeight,
                          stemThickness, length
  Rectangular Tube      — outerWidth, outerHeight, wallThickness, length
  Round Tube             — outerDiameter, wallThickness, length
  Z-Purlin              — height, flangeWidth, lipHeight, thickness, length
  Hat Channel            — topWidth, height, flangeWidth, thickness, length
  Standard presets for each (AISC W-shapes, ASTM channels, etc.)
  
Keyway / Key (Woodruff, Square, Rectangular)
  width, height, length, shaftDiameter
  
Pulley / Sheave
  pitchDiameter, grooveProfile (V/flat/timing), grooves, width, boreDiameter
  
Sprocket
  teeth, pitch, rollerDiameter, boreDiameter, thickness
  Chain Link
  pitch, innerWidth, rollerDiameter, pinDiameter
```

#### 1.6 Decorative & Miscellaneous Shapes

```
Star (extruded)          — outerRadius, innerRadius, points (3–32), depth
Heart (extruded)         — scale, depth
Arrow (3D)               — shaftLength, shaftRadius, headLength, headRadius
Cross / Plus (extruded)  — armLength, armWidth, depth
Crescent / Moon          — outerRadius, innerRadius, offset, depth
Egg / Ovoid              — length, maxRadius, pointedness
3D Text                  — fontFamily (system + bundled fonts),
                           fontSize, depth, bevelEnabled, bevelThickness,
                           bevelSize, bevelSegments, curveSegments,
                           letterSpacing, lineHeight, textAlign
                           Supports: Latin, numbers, punctuation, 
                           common symbols, Unicode (font-dependent)
```

#### 1.7 Platonic & Archimedean Solids

```
Tetrahedron              — edgeLength
Octahedron               — edgeLength
Dodecahedron             — edgeLength
Icosahedron              — edgeLength
Truncated Icosahedron (Soccer Ball) — edgeLength
Cuboctahedron            — edgeLength
Rhombicosidodecahedron   — edgeLength
Geodesic Sphere          — radius, subdivisions (1–8), type (icosa/octa)
```

#### 1.8 Sketch-to-Solid Shapes

These require the user to draw a 2D profile first using the sketch tools (Section 4), then convert to 3D:

```
Extruded Polygon / Profile
  Draw any closed 2D shape → extrude to specified height
  Options: taper angle, twist angle during extrusion
  
Revolved Profile (Lathe)
  Draw a 2D profile curve → revolve around an axis (X, Y, or custom)
  Options: revolution angle (1°–360°), segments
  
Lofted Shape
  Define two or more 2D cross-section profiles at different heights
  → smooth surface interpolation between them
  Options: linear vs smooth interpolation, twist, scale curve
  
Swept Shape
  Define a 2D cross-section + a 3D path (line, arc, spline, helix)
  → sweep profile along path
  Options: bank/tilt along path, scale along path
  
Pipe from Path
  Define a 3D path → generate pipe with circular/rectangular cross-section
  Options: wall thickness, cap ends, fillet corners

Extruded SVG
  Import an SVG file → each closed path becomes an extrudable shape
  Options: extrusion height, per-path height, bevel
  
Extruded DXF
  Import a DXF 2D drawing → extrude closed polylines
```

---

### SECTION 2: CAD OPERATIONS — TRANSFORMS

Every operation must feel instant and responsive. Visual feedback (gizmos, previews, dimension labels) must update in real-time during interaction.

#### 2.1 Basic Transforms

```
TRANSLATE (Move)
  - 3D gizmo with X (red), Y (green), Z (blue) arrows
  - Plane handles (XY, XZ, YZ) for two-axis movement
  - Center handle for free movement (screen-space)
  - Type exact X, Y, Z values in properties panel
  - Keyboard: press G, then optionally X/Y/Z to constrain
  - Hold Shift during drag for slow/precise mode
  - Show distance moved as floating label during drag
  - Respects active snap setting
  
ROTATE
  - 3D gizmo with three rotation rings (X, Y, Z)
  - Trackball ring for free rotation
  - Type exact rotation angles in properties panel
  - Keyboard: press R, then optionally X/Y/Z to constrain
  - Show degree value as floating label during drag
  - Angular snap options: 90°, 45°, 30°, 15°, 10°, 5°, 1°, free
  - Rotate around: object center, object pivot, world origin, 
    another object's center, custom point
  
SCALE
  - 3D gizmo with cube handles on each axis
  - Corner handles for uniform scale
  - Type exact scale factors or target dimensions in properties
  - Keyboard: press S, then optionally X/Y/Z to constrain
  - Scale from: object center, object pivot, bounding box corner,
    world origin, custom point
  - Show scale factor and resulting dimensions during drag
  - Negative scale for mirroring allowed
  
STRETCH (Non-Uniform Scale with Anchor)
  - Select one face/side of bounding box → drag to stretch
  - Opposite face stays anchored
  - Different from scale: anchor point is always the opposite face
  - Show dimension change during drag
```

#### 2.2 Advanced Transforms

```
MIRROR / REFLECT
  - Mirror across: XY, XZ, YZ world planes
  - Mirror across custom plane (pick 3 points or existing face)
  - Options: mirror copy (keep original + create mirrored duplicate)
             OR mirror move (replace original)
  - Works on single objects, multi-selection, and groups

ALIGN
  - Select two+ objects → align panel:
    - Align X: left edges, centers, right edges
    - Align Y: bottom edges, centers, top edges
    - Align Z: front edges, centers, back edges
  - Align to: first selected, last selected, bounding box of selection,
    world origin, grid
  - "Place on ground" — snap bottom face to Y=0

DISTRIBUTE / SPACE EVENLY
  - Select three+ objects → distribute panel:
    - Distribute along X, Y, or Z
    - Equal spacing between objects (edge-to-edge or center-to-center)
    - Specify exact gap distance

CENTER TO ORIGIN
  - Move selected object so its center sits at world (0, 0, 0)
  - Option: center XZ only (keep Y height)

SNAP TO FACE
  - Pick a face on object A, pick a face on object B
  - Object A moves and rotates so the two faces are flush/aligned
  - Option: flip direction (faces touching vs facing same way)

DUPLICATE
  - Ctrl+D: duplicate in place (slight offset for visibility)
  - Duplicate and transform: duplicate, then immediately enter move mode
  - Linked duplicate: duplicate that mirrors parameter changes of original
```

#### 2.3 Pivot & Coordinate Systems

```
PIVOT POINT (transform origin):
  - Object center (bounding box center) — default
  - Object origin (stored per-object, adjustable)
  - Median point (center of multi-selection)
  - Active element (last selected object's center)
  - World origin (0,0,0)
  - Custom point (click to place)
  - 3D cursor (persistent placeable reference point like Blender)

COORDINATE SPACE:
  - World (global XYZ)
  - Local (object's own axes, rotates with object)
  - View (screen-relative)
  - Parent (relative to group parent)
  - Custom (user-defined coordinate system)

Gizmo visually updates to show current coordinate space.
```

---

### SECTION 3: CAD OPERATIONS — BOOLEANS & CONSTRUCTION

#### 3.1 Boolean Operations

```
UNION (Add / Merge)
  - Select two+ solid objects → combine into single solid
  - Overlapping volume merged, internal faces removed
  - Result is watertight mesh
  
SUBTRACT / DIFFERENCE (Cut / Dig)
  - Select target object (A), then tool object (B)
  - B's volume is carved out of A
  - B is consumed (deleted) after operation — or optionally kept
  - "Hole" designation: mark any object as a "hole" — when grouped
    with solids, it automatically subtracts from all solids in the group
  - This is the primary "dig into one shape using another" operation
  
INTERSECT
  - Select two+ objects → keep ONLY the overlapping volume
  - Non-overlapping portions removed
  
NON-DESTRUCTIVE BOOLEAN (Parametric Boolean)
  - Boolean is stored as an operation node, not baked into mesh
  - Source shapes remain editable underneath
  - Change source shape → boolean result updates live
  - Toggle boolean on/off to see before/after
  - Reorder boolean operations
  - Convert to mesh (bake) when done editing

BOOLEAN WORKFLOW UX:
  - Ghost preview: when hovering tool over target, show transparent
    preview of what the result will look like
  - Color coding: target = normal color, tool = red tint during operation
  - Error handling: if boolean fails (non-manifold mesh, degenerate 
    geometry), show clear error message with suggestion to fix
  - Multi-boolean: apply one tool to many targets simultaneously
  - Boolean history: see list of all booleans, reorder, delete individual ones
```

#### 3.2 Extrude & Intrude

```
FACE EXTRUDE
  - Enter face-select mode on any mesh
  - Select one or more faces
  - Pull outward (extrude) or push inward (intrude)
  - Extrude distance shown as floating label
  - Options:
    - Along face normal (default)
    - Along custom direction vector
    - Along individual normals (for multi-face, each face moves its own way)
  - Taper extrude: scale faces inward/outward while extruding (creates 
    tapered protrusions or indentations)
  - Twist extrude: rotate faces around extrusion axis while extruding
  - Multi-step extrude: extrude, then extrude again from new face, building
    complex features step by step

EDGE EXTRUDE
  - Select an edge → extrude to create a new face/surface
  
VERTEX EXTRUDE
  - Select a vertex → extrude to create an edge
```

#### 3.3 Fillet & Chamfer

```
FILLET (Round edges)
  - Select one or more edges on a mesh
  - Specify radius (mm)
  - Specify segments (1–32, more = smoother)
  - Preview curve before confirming
  - Variable radius fillet: different radius at start and end of edge
  - Fillet chain: automatically select connected edge loops
  - Fillet all edges at once option (with radius)

CHAMFER (Flat bevel)
  - Select one or more edges
  - Specify distance (symmetric) or two distances (asymmetric)
  - Specify segments (1 = flat cut, 2+ = faceted approach to round)
  - Preview before confirming
  
BOTH:
  - Work on straight and curved edges
  - Handle edge-to-edge intersections (3+ edges meeting at vertex)
  - Respect adjacent fillets/chamfers (no self-intersection)
```

#### 3.4 Shell (Hollow Out)

```
SHELL
  - Select a solid object → specify wall thickness
  - Result: hollow version of the shape
  - Options:
    - Shell outward (grow), shell inward (shrink), shell both directions
    - Open shell: select faces to REMOVE before shelling 
      (creates entry holes — essential for 3D-printable enclosures,
       vases, containers, etc.)
    - Variable thickness: different walls for different faces (advanced)
  - Preview before confirming
```

#### 3.5 Offset / Inset Face

```
OFFSET SURFACE
  - Grow or shrink entire mesh by a uniform distance
  - Useful for creating clearance or interference fits

INSET FACE
  - Select a face → inset creates a smaller face within it
  - Specify inset distance
  - Then optionally extrude/intrude the inset face
  - Key workflow for creating recessed features, pockets, raised pads
```

#### 3.6 Split & Section

```
SPLIT / CUT WITH PLANE
  - Define a cutting plane (pick from XY/XZ/YZ, or place custom plane 
    with position + rotation, or pick 3 points)
  - Cut object → produces two separate objects
  - Options: keep both halves, keep one, fill cut faces (cap) or leave open

SPLIT WITH ANOTHER OBJECT
  - Use any shape's surface as the cutting surface (not just planes)

SECTION VIEW / CLIP PLANE
  - Non-destructive visualization clip plane
  - Drag through model to see cross-sections
  - Show cross-section outline with hatching
  - Toggle on/off, does not modify geometry
  - Multiple clip planes simultaneously
```

#### 3.7 Array / Pattern

```
LINEAR ARRAY
  - Select object → specify:
    - Direction (X, Y, Z, or custom vector)
    - Count (2–1000)
    - Spacing (distance between copies, or total distance / count)
    - Offset per step (optional translate, rotate, scale increment)
  - Preview all copies before confirming
  - Result can be: individual objects, or merged into single object

CIRCULAR / POLAR ARRAY
  - Select object → specify:
    - Center point and axis of rotation
    - Count (2–360)
    - Total angle (e.g., 360° for full circle, 180° for half)
    - Rotate copies to follow circle, or keep original orientation
  - Preview all copies before confirming

GRID ARRAY
  - Rows (X), Columns (Z), Layers (Y)
  - Spacing per axis
  - Optional stagger (offset every other row/column)

ARRAY ALONG PATH
  - Define or select a path (line, arc, spline, helix, or edge of another shape)
  - Count or spacing
  - Objects oriented along path tangent, or keep original orientation
  - Scale along path curve
  
MIRROR ARRAY
  - Single mirror producing 2 copies
  - Double mirror (across two planes) producing 4 copies
  - Triple mirror producing 8 copies (all octants)

ALL ARRAYS:
  - Non-destructive (edit source object → all copies update)
  - Convert to individual objects when done
  - Merge array into single mesh option
```

#### 3.8 Deformation Tools (Advanced)

```
BEND
  - Select object → choose bend axis → specify angle
  - Define bend region (start/end along axis)
  - Preview deformed mesh in real-time
  
TAPER
  - Select object → choose taper axis → specify taper factor
  - One end stays original size, other end scales by factor
  
TWIST
  - Select object → choose twist axis → specify total twist angle
  - Mesh segments twist progressively along axis
  
LATTICE DEFORM (Free-Form Deformation)
  - Place a control cage (lattice) around object
  - Lattice divisions: 2×2×2 up to 10×10×10
  - Drag lattice control points → mesh deforms smoothly
  - Non-destructive: edit lattice, mesh updates
  - Apply lattice to bake deformation

SMOOTH / SUBDIVIDE
  - Catmull-Clark subdivision: 1–4 levels
  - Non-destructive: preview smooth with wireframe overlay
  - Apply to bake into mesh
  - Loop subdivision alternative
  - Smooth selected faces/regions only

SIMPLIFY / DECIMATE
  - Reduce polygon count: specify target face count or ratio
  - Methods: collapse edges, planar decimation, quadric error metrics
  - Preview before applying
  - Essential for cleaning up imported high-poly models or AI-generated meshes
```

---

### SECTION 4: 2D SKETCH SYSTEM

A proper sketch mode for drawing 2D profiles that become 3D shapes.

```
ENTERING SKETCH MODE:
  - Click "New Sketch" → pick a plane (XY, XZ, YZ, or face of existing object)
  - Viewport rotates to face the sketch plane
  - Grid overlays on sketch plane
  - 3D objects become ghosted/transparent

SKETCH TOOLS:
  Line              — click start + end point, chain multiple lines
  Rectangle         — click corner + drag, or center + corner
  Circle            — center + radius, or 3-point circle
  Ellipse           — center + two radii
  Arc               — center + start + end, or 3-point arc
  Polygon           — center + radius + sides
  Spline / B-Spline — click control points, smooth curve through them
  Bezier Curve      — click points with tangent handles
  Freehand          — draw with mouse, auto-smooth into curve
  Offset Curve      — select existing sketch edge, offset by distance
  Fillet (2D)       — round a corner between two sketch lines
  Chamfer (2D)      — straight bevel at a corner
  Trim              — click to delete portions of overlapping sketch lines
  Extend            — extend a line to meet another line
  Mirror (2D)       — mirror sketch elements across a line
  
SKETCH CONSTRAINTS (parametric):
  Horizontal        — line forced horizontal
  Vertical          — line forced vertical
  Coincident        — two points locked together
  Concentric        — two circles share center
  Equal Length      — two lines forced to same length
  Parallel          — two lines forced parallel
  Perpendicular     — two lines forced 90° apart
  Tangent           — curve tangent to another curve/line
  Fixed             — point/element locked in position
  Symmetric         — elements symmetric about a line
  Dimension         — explicit numeric dimension (driving constraint)
  
SKETCH-TO-3D:
  Close a sketch profile → right-click → Extrude / Revolve / Sweep / Loft
  Multiple closed profiles = multiple extrusions
  Nested profiles = automatic hole detection (outer = solid, inner = hole)
  
SKETCH VISUALS:
  Fully constrained sketch = green lines
  Under-constrained = blue lines (can still be moved)
  Over-constrained = red lines (conflict, must resolve)
  Dimensions displayed as annotations with editable values
```

---

### SECTION 5: SNAP & PRECISION SYSTEM

```
GRID SNAP PRESETS (toolbar dropdown or radio buttons):
  ┌──────────────────────┐
  │ ● 5 mm               │
  │ ○ 1 mm               │
  │ ○ 0.5 mm             │
  │ ○ 0.1 mm             │
  │ ○ 0.01 mm            │
  │ ○ No Snap (free)     │
  └──────────────────────┘
  
  Keyboard shortcut to cycle snap modes (e.g., ` backtick)
  Shift held during drag = temporarily use next-finer snap
  Ctrl held during drag = temporarily disable snap (free)

OBJECT SNAP (in addition to grid):
  Snap to vertex         — magnetic pull to vertices of other objects
  Snap to edge midpoint  — center of edges
  Snap to face center    — center of faces
  Snap to edge           — anywhere along an edge
  Snap to perpendicular  — point on edge nearest to perpendicular from cursor
  Snap to intersection   — where two edges/lines cross
  Snap to origin         — world (0,0,0)
  Snap to object center  — bounding box center of other objects
  
  Toggle individual snap types on/off in snap settings
  Visual indicators: yellow circle when snapping to vertex,
  blue diamond for midpoint, green square for face center, etc.
  
ANGULAR SNAP:
  When rotating, snap to: 90°, 45°, 30°, 15°, 10°, 5°, 1°, free
  Configurable in snap settings panel
  
GRID DISPLAY:
  Show/hide grid (keyboard: G+G or toggle button)
  Grid auto-adapts to current snap setting (lines match snap intervals)
  Major grid lines every 10× snap interval
  Fade grid lines that are too dense at current zoom
  Grid on selectable plane: XY (top), XZ (front), YZ (right), all
  Infinite ground plane option (subtle gradient)
  Grid origin indicator (bold lines at X=0, Z=0)
```

---

### SECTION 6: MEASUREMENT & DIMENSIONING

```
RULER / DISTANCE TOOL
  - Click point A → click point B → floating label shows distance in mm
  - Also shows ΔX, ΔY, ΔZ components
  - Measurement persists as an annotation until dismissed
  - Snap to vertices/edges/faces of objects for precise measurement

ANGLE TOOL
  - Click three points (A, B vertex, C) → shows angle at B
  - Displayed as arc annotation with degree value

RADIUS / DIAMETER TOOL
  - Click a circular edge or cylindrical face → shows radius and diameter

AREA TOOL
  - Select a face → shows surface area in mm²

VOLUME TOOL
  - Select a solid object → shows volume in mm³ (and cm³)
  - Shows in properties panel permanently for selected object

BOUNDING BOX DIMENSIONS
  - Always visible in properties panel for selected object
  - Width (X), Height (Y), Depth (Z) of bounding box
  - Total surface area, total volume, vertex count, face count

PERSISTENT DIMENSIONS
  - Option to pin measurements to the viewport as annotations
  - Annotations move with objects
  - Show/hide all dimensions toggle

UNIT SYSTEM
  - Primary: mm (default), cm, m, inches, feet
  - Display precision: 0, 1, 2, 3, 4 decimal places
  - All internal math in mm, convert for display only
```

---

### SECTION 7: FILE IMPORT & EXPORT

#### 7.1 Import

```
SUPPORTED IMPORT FORMATS:
  STL          — ASCII and Binary
  OBJ          — with MTL material files
  GLTF / GLB   — full PBR material support
  FBX          — common exchange format
  3MF          — 3D printing format with color/material
  STEP / STP   — via backend OpenCascade or GMSH conversion
  IGES / IGS   — via backend conversion
  PLY          — with vertex colors
  DAE          — Collada
  AMF          — Additive Manufacturing Format
  OFF          — Object File Format
  SVG          — imported as 2D sketch paths → extrude workflow
  DXF          — imported as 2D sketch paths → extrude workflow

IMPORT WORKFLOW:
  1. "Import" button in toolbar, OR drag-and-drop file onto viewport
  2. Import settings dialog:
     - Preview of the model (quick render)
     - Detected units / scale
     - Up-axis correction (Y-up vs Z-up)
     - Center model on origin toggle
     - Place on ground plane toggle
     - Scale factor input
     - Merge by material toggle
  3. Model appears in scene, fully manipulable:
     translate, rotate, scale, stretch, mirror
  4. Imported mesh can participate in ALL operations:
     Boolean union/subtract/intersect, arrays, deformation
  5. Properties panel shows: source filename, vertex count, face count,
     triangle count, file size, bounding dimensions, watertight status
  6. Option to "Repair Mesh" — fix non-manifold edges, fill holes,
     remove degenerate triangles, unify normals
```

#### 7.2 Export

```
SUPPORTED EXPORT FORMATS:
  STL          — ASCII and Binary (for 3D printing)
  OBJ          — with MTL
  GLTF / GLB   — for web, games, AR (with PBR textures)
  3MF          — for 3D printing with color
  PLY          — with vertex colors
  DAE          — Collada
  STEP         — via backend conversion (for other CAD software)
  FBX          — for game engines
  USD / USDZ   — for Apple AR and Pixar pipeline
  
EXPORT OPTIONS:
  Export scope: selected objects only / entire scene / visible only
  Coordinate system: Y-up (default) / Z-up
  Scale on export: 1:1, or custom factor
  Units annotation in file (where format supports)
  Merge all objects into single mesh: yes/no
  Apply modifiers/booleans before export: yes/no
  Include textures/materials: yes/no
  Binary vs ASCII (where applicable)
  Polygon limit / auto-decimate for export
  
3D PRINT EXPORT ASSISTANT:
  - Check mesh is watertight (manifold)
  - Check minimum wall thickness
  - Check no inverted normals
  - Auto-repair option
  - Show print volume preview (with common printer bed sizes)
  - Show estimated print dimensions
  - Export as STL or 3MF with correct units
```

---

### SECTION 8: USER INTERFACE

```
LAYOUT:
┌──────────────────────────────────────────────────────────────────────────┐
│  x1cad   [File▾][Edit▾][View▾][Mesh▾][Tools▾][Help▾]  [🤖 AI]  [⚙]   │
├──────────┬───────────────────────────────────────────────┬──────────────┤
│ LEFT     │                                               │ RIGHT       │
│ PANEL    │            3D VIEWPORT                        │ PANEL       │
│          │                                               │             │
│ SHAPES   │    Perspective / Orthographic view            │ PROPERTIES  │
│ tab      │                                               │ of selected │
│          │    Grid + Axes + Gizmo on selection           │ object      │
│ TOOLS    │                                               │             │
│ tab      │    Navigation cube (top-right corner)         │ Name        │
│          │    View buttons (Top/Front/Right/Iso)         │ Transform   │
│ SKETCH   │                                               │ Dimensions  │
│ tab      │                                               │ Material    │
│          │                                               │ Shape params│
│ SNAP     │                                               │             │
│ controls │                                               ├──────────────┤
│          │                                               │ SCENE TREE  │
│          │                                               │ (hierarchy) │
│          │                                               │             │
│          │                                               │ ▾ Scene     │
│          │                                               │  ├ Box1     │
│          │                                               │  ├ Gear3    │
│          │                                               │  └ ▾Group1  │
│          │                                               │    ├ Body   │
│          │                                               │    └ Hole   │
├──────────┴───────────────────────────────────────────────┴──────────────┤
│ [Move][Rotate][Scale][Boolean][Extrude] | Snap:1mm | Grid:ON | 42 objs │
│ [Undo][Redo] | Selection: Box1 | 12,450 verts | RAM: 1.1GB | GPU: OK  │
└────────────────────────────────────────────────────────────────────────┘

PANELS:
  - All panels resizable by dragging borders
  - All panels collapsible (click header to collapse)
  - Panels can be detached into floating windows
  - Layout saved per user and restored on reload
  - Fullscreen viewport mode (hide all panels, press Tab)

TOOLBAR:
  - Icon + tooltip for every tool
  - Tool options appear in a floating bar below viewport when tool is active
  - Active tool highlighted
  - Right-click on toolbar to customize

CONTEXT MENU:
  - Right-click on object: Cut, Copy, Paste, Duplicate, Delete, Group,
    Ungroup, Boolean submenu, Hide, Isolate, Select Similar,
    Edit Parameters, Reset Transform
  - Right-click on viewport background: Paste, Select All, View submenu,
    Snap settings, Grid settings
  - Right-click on scene tree item: same as object context + 
    Rename, Reorder, Color tag

THEME:
  - Dark mode (default): dark gray viewport, darker panels, 
    light text, accent color
  - Light mode: white/light gray, dark text
  - Toggle in settings
  - Custom accent color

RESPONSIVE:
  - Minimum: 1280×720
  - Panels auto-collapse on smaller screens
  - Touch support for tablets (pinch zoom, two-finger orbit)
```

---

### SECTION 9: VIEWPORT & INTERACTION

```
CAMERA:
  Orbit:   Middle mouse drag / Alt + Left mouse
  Pan:     Shift + Middle mouse / Right mouse drag
  Zoom:    Scroll wheel / Pinch gesture
  Focus:   F key → zoom to fit selected object
  Focus all: Shift+F → zoom to fit entire scene
  Home:    Home key → reset to default isometric view
  
PRESET VIEWS:
  Numpad 1 = Front       Ctrl+1 = Back
  Numpad 3 = Right       Ctrl+3 = Left
  Numpad 7 = Top         Ctrl+7 = Bottom
  Numpad 5 = Toggle perspective/orthographic
  Numpad 0 = Camera view (if camera object placed)
  
  Navigation Cube (top-right of viewport):
    Click faces/edges/corners to snap to that view
    Drag to orbit
    Shows current orientation at all times

SELECTION:
  Click = select single object
  Shift+Click = toggle add/remove from selection
  Ctrl+Click = add to selection
  Drag rectangle = box select (left-to-right = intersect, 
                               right-to-left = fully enclosed)
  Ctrl+A = select all
  Ctrl+D = deselect all
  Escape = deselect / cancel current operation
  Double-click = enter edit mode (face/edge/vertex selection)
  
  EDIT MODE SUB-SELECTION:
    1 = vertex select mode
    2 = edge select mode
    3 = face select mode
    Click to select, Shift+Click to multi-select
    Loop select: Alt+Click on edge → selects entire edge loop
    Ring select: Ctrl+Alt+Click → selects edge ring
    Grow selection: Ctrl+Numpad+
    Shrink selection: Ctrl+Numpad-
    Select linked: Ctrl+L
    Select all of same material: Shift+G

KEYBOARD SHORTCUTS (comprehensive):
  TRANSFORMS:
    G           = Grab (move)
    R           = Rotate
    S           = Scale
    G/R/S + X   = Constrain to X axis
    G/R/S + Y   = Constrain to Y axis
    G/R/S + Z   = Constrain to Z axis
    G/R/S + Shift+X = Constrain to YZ plane (exclude X)
    G + type number = Move by exact amount (e.g., G X 10 Enter)
    Escape      = Cancel transform
    Enter       = Confirm transform

  OPERATIONS:
    Ctrl+Z      = Undo
    Ctrl+Shift+Z = Redo (or Ctrl+Y)
    Ctrl+C      = Copy
    Ctrl+V      = Paste
    Ctrl+D      = Duplicate
    Delete      = Delete selected
    Ctrl+G      = Group selected
    Ctrl+Shift+G = Ungroup
    H           = Hide selected
    Alt+H       = Unhide all
    /           = Isolate selected (hide everything else)
    Ctrl+1/2/3  = Boolean Union / Subtract / Intersect (with two selected)
    E           = Extrude (in edit mode with face selected)
    I           = Inset face (in edit mode)
    Ctrl+B      = Bevel / Chamfer (in edit mode with edge selected)
    P           = Separate selection to new object
    Ctrl+J      = Join objects into single mesh

  VIEWPORT:
    Tab         = Toggle AI panel
    Numpad .    = Focus selected
    Z           = Render mode pie menu (Solid/Wire/X-Ray/Matcap)
    T           = Toggle left panel
    N           = Toggle right panel
    Ctrl+Space  = Maximize viewport (toggle)

  FILE:
    Ctrl+S      = Save project
    Ctrl+Shift+S = Save as
    Ctrl+O      = Open project
    Ctrl+N      = New project
    Ctrl+I      = Import file
    Ctrl+E      = Export
    
  All shortcuts displayed in menus and customizable in settings.
```

---

### SECTION 10: RENDERING & DISPLAY

```
RENDER MODES (cycle with Z key pie menu):
  Solid             — default PBR-lit rendering
  Solid + Wireframe — mesh edges overlaid on solid
  Wireframe Only    — edges only, no fill
  X-Ray             — semi-transparent solid, see through objects
  Flat Shaded       — per-face shading, shows facets clearly
  Matcap            — material-capture sphere shading (fast, pretty)
  Clay              — uniform gray material, no textures, good for form review

MATERIALS (per-object):
  Color picker (hex, RGB, HSL)
  Opacity (0–1)
  Metalness (0–1)
  Roughness (0–1)
  Emissive color and intensity
  Texture map upload (diffuse, normal, roughness, metalness, AO)
  Material library: presets for common materials
    (steel, aluminum, brass, copper, gold, silver,
     wood varieties, plastic colors, glass, rubber,
     concrete, ceramic, carbon fiber, etc.)

LIGHTING:
  Default three-point light setup (key, fill, rim)
  HDR environment maps (selectable presets: studio, outdoor, warehouse, etc.)
  SSAO (screen-space ambient occlusion) toggle
  Soft shadows toggle
  Adjust environment intensity and rotation

DISPLAY TOGGLES:
  Grid on/off
  Axes helper on/off
  Wireframe overlay on/off
  Bounding boxes on/off
  Measurement annotations on/off
  Face orientation overlay (blue = front, red = back / flipped normals)
  Statistics overlay (FPS, draw calls, triangles, memory)
  Background: solid color / gradient / environment map / transparent
```

---

### SECTION 11: SCENE & PROJECT MANAGEMENT

```
SCENE HIERARCHY (tree panel):
  - Drag to reorder objects
  - Drag onto another object to parent (create group)
  - Eye icon to toggle visibility per object
  - Lock icon to prevent selection/editing per object
  - Color dot to tag/categorize objects (red, blue, green, yellow, etc.)
  - Right-click: rename, duplicate, delete, isolate, select children
  - Search/filter bar at top of tree
  - Multi-select in tree with Shift/Ctrl click

GROUPING:
  - Select objects → Ctrl+G → creates Group
  - Groups can be nested (groups inside groups)
  - Double-click group to enter (edit children individually)
  - Click outside to exit group
  - Groups have their own transform (move group = move all children)
  - Ungroup: Ctrl+Shift+G
  - "Hole" boolean groups: children marked as holes auto-subtract

LAYERS (optional advanced feature):
  - Create named layers
  - Assign objects to layers
  - Toggle layer visibility
  - Toggle layer editability (lock)
  - Layer colors for visual distinction

UNDO / REDO:
  - Minimum 200 undo steps
  - Every operation recorded: transforms, booleans, additions, deletions,
    parameter changes, material changes, grouping, etc.
  - Undo history panel: see list of all actions, click to jump to any state
  - Memory-aware: flush oldest undo states if memory pressure

SAVE / LOAD:
  - Projects saved as .x1cad files (ZIP containing JSON scene graph +
    embedded mesh files + textures + metadata)
  - JSON scene graph stores: all objects, their parameters, transforms,
    materials, groups, boolean history, sketch data, AI generation metadata
  - Auto-save every 60 seconds to browser IndexedDB + backend data/ directory
  - Manual save: Ctrl+S → saves to backend data/projects/
  - Open recent projects list
  - Project thumbnails (auto-captured viewport screenshot)
  - Export project as portable .x1cad file (all assets embedded)
  - Import .x1cad file from another machine
```

---

### SECTION 12: AI 3D GENERATION (Hunyuan3D 2.1)

#### 12.1 Model Introduction

The AI generation feature uses **Tencent Hunyuan3D 2.1**, an open-source state-of-the-art 3D generation model that creates textured 3D meshes from text descriptions, reference images, or both.

**Two-stage pipeline:**
- **Hunyuan3D-Shape v2.1** (3.3B parameters) — Generates untextured 3D mesh geometry from text and/or image input using a DiT (Diffusion Transformer) flow matching architecture.
- **Hunyuan3D-Paint v2.1** (2B parameters) — Synthesizes PBR (physically-based rendering) textures onto the generated mesh using multi-view consistent texture painting.

**Capabilities:**
- **Text-to-3D:** Describe any object in natural language → get a 3D mesh
- **Image-to-3D:** Upload/paste a reference photo, sketch, or concept art → get a 3D mesh matching it
- **Text + Image-to-3D:** Combine text description with reference image for guided generation

#### 12.2 Model Links & Resources

```
GitHub Repository:
  https://github.com/tencent-hunyuan/hunyuan3d-2.1

Shape Model (3.3B params, DiT Flow Matching):
  https://huggingface.co/tencent/Hunyuan3D-2.1/tree/main/hunyuan3d-dit-v2-1

Texture/Paint PBR Model (2B params):
  https://huggingface.co/tencent/Hunyuan3D-2.1/tree/main/hunyuan3d-paintpbr-v2-1

Base Repository:
  https://huggingface.co/tencent/Hunyuan3D-2.1
```

#### 12.3 Memory-Optimized Inference Strategy

```
VRAM BUDGET: ≤ 15GB peak
SYSTEM RAM BUDGET: ≤ 18GB peak during AI inference

STRATEGY — Sequential loading with full cleanup between stages:

  1. Load Shape Model in FP16 → ~5-6GB VRAM
  2. Run shape inference → peak ~8-10GB VRAM
  3. Save mesh to disk
  4. FULLY unload shape model:
     - Move to CPU then delete
     - torch.cuda.empty_cache()
     - gc.collect()
     - Verify via pynvml that VRAM is freed
  5. Load Paint Model in FP16 with:
     - Attention slicing enabled (process attention in chunks)
     - CPU offloading for non-critical layers (uses system RAM)
     - Reduced max_num_view (4 instead of 6)
     - Resolution capped at 512px (not 1024)
  6. Run texture inference → peak ≤ 15GB VRAM
  7. Save textured mesh
  8. FULLY unload paint model → VRAM returns to near-zero

FALLBACK CASCADE if approaching limit:
  - Reduce resolution: 512 → 384 → 256
  - Reduce views: 4 → 3 → 2
  - Increase CPU offloading proportion
  - If OOM occurs: catch gracefully, return shape-only result,
    inform user "Texture generation exceeded VRAM. 
    Untextured shape has been saved."

After generation completes: all models unloaded, system returns 
to normal CAD-only resource usage (~800MB RAM, minimal VRAM).
```

#### 12.4 AI Panel UI

```
┌─────────────────────────────────────────────────────┐
│  🤖 AI 3D Generator                    [? Help] [×] │
│─────────────────────────────────────────────────────│
│                                                      │
│  GPU: RTX 4070 Ti Super (16GB) ✅ AI Ready           │
│  Mode: Full (Shape + Texture)                        │
│                                                      │
│  ═══ Input ═══                                       │
│                                                      │
│  [📝 Text] [🖼 Image] [📝+🖼 Both]                    │
│                                                      │
│  Text Description:                                   │
│  ┌─────────────────────────────────────────────┐     │
│  │ A steampunk mechanical clock with brass     │     │
│  │ gears and Roman numeral face               │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  Reference Image:                                    │
│  ┌──────────┐  [📁 Upload File]                      │
│  │          │  [📋 Paste from Clipboard]              │
│  │ (preview)│  [🔗 Paste Image URL]                  │
│  │          │  [📷 Use Viewport Screenshot]           │
│  └──────────┘                                        │
│  Supported: PNG, JPG, WEBP                           │
│                                                      │
│  ═══ Options ═══                                     │
│                                                      │
│  Output:  (●) Shape + Texture  ( ) Shape Only        │
│  Quality: [Low 256] [Medium 512●] [High 1024*]      │
│  * High requires 20GB+ VRAM                          │
│                                                      │
│  [        🚀 Generate 3D Model        ]              │
│                                                      │
│  ═══ Progress ═══                                    │
│  ████████░░░░░░░░  52%                               │
│  Stage: Generating shape...                          │
│  Elapsed: 0:23  |  ETA: ~0:22                        │
│  VRAM: 9.2 / 15.0 GB  |  RAM: 14.1 / 18.0 GB       │
│                                                      │
│  ═══ Result ═══                                      │
│  ┌─────────────────────────────────────┐             │
│  │                                     │             │
│  │     (interactive 3D preview         │             │
│  │      of generated model,            │             │
│  │      orbit to inspect)              │             │
│  │                                     │             │
│  └─────────────────────────────────────┘             │
│  Vertices: 15,234  |  Faces: 30,468                  │
│                                                      │
│  [✅ Add to Scene] [🔄 Regenerate] [💾 Download]     │
│  [🗑 Discard]                                        │
│                                                      │
│  ═══ History ═══                                     │
│  Recent generations (thumbnails, re-insert or delete)│
└─────────────────────────────────────────────────────┘

WHEN AI IS DISABLED:
┌─────────────────────────────────────────────────────┐
│  🤖 AI 3D Generator                            [×]  │
│─────────────────────────────────────────────────────│
│                                                      │
│  ⚠️ AI Generation Unavailable                        │
│                                                      │
│  Requires: NVIDIA RTX GPU with CUDA and ≥10GB VRAM  │
│                                                      │
│  Detected:                                           │
│   GPU: Intel UHD Graphics 770                        │
│   CUDA: Not available                                │
│   VRAM: N/A                                          │
│                                                      │
│  All manual CAD features work fully without a GPU.   │
│                                                      │
│  [🔄 Re-detect Hardware]                             │
│  [📖 View GPU Requirements]                          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

#### 12.5 AI Model Integration with CAD

Once an AI-generated model is added to the scene, it becomes a standard scene object with full CAD capabilities:

```
AI MODEL IN SCENE CAN BE:
  - Translated, rotated, scaled, stretched, mirrored (all transform tools)
  - Used in Boolean operations (union, subtract, intersect with any shape)
  - Measured with ruler, angle, volume tools
  - Arrayed (linear, circular, grid, path)
  - Deformed (bend, taper, twist, lattice)
  - Decimated (reduce poly count for performance or 3D printing)
  - Repaired (fix non-manifold geometry, fill holes)
  - Exported alongside manually-created CAD objects
  - Duplicated, grouped, layered like any other object
  - Have material/color changed in properties panel
  - Re-sent to AI: select model → "Re-texture" → sends mesh back
    to Paint pipeline with new prompt or image for fresh textures
```

---

### SECTION 13: BACKEND API DESIGN

```
SYSTEM:
  GET    /api/system/status          — Hardware info, AI capability, versions
  GET    /api/system/health          — Health check (for monitoring)

AI GENERATION:
  GET    /api/ai/models/status       — Are models downloaded? Sizes? 
  POST   /api/ai/models/download     — Trigger model download
  POST   /api/ai/generate            — Start generation job
           body: { mode, prompt, image, generate_texture, resolution }
  GET    /api/ai/jobs/{id}/status    — Poll job status & progress
  GET    /api/ai/jobs/{id}/result    — Get result mesh file
  DELETE /api/ai/jobs/{id}           — Cancel/cleanup job
  WS     /ws/ai/jobs/{id}/progress   — Real-time progress stream

FILE OPERATIONS:
  POST   /api/files/upload           — Upload 3D model / image
  POST   /api/files/convert          — Convert format (e.g., STEP→GLTF)
  GET    /api/files/{id}             — Download processed file
  POST   /api/files/repair-mesh      — Fix non-manifold, fill holes
  POST   /api/files/decimate         — Reduce poly count

PROJECTS:
  GET    /api/projects               — List all projects
  POST   /api/projects               — Create new project
  GET    /api/projects/{id}          — Load project (JSON scene + assets)
  PUT    /api/projects/{id}          — Save/update project
  DELETE /api/projects/{id}          — Delete project
  GET    /api/projects/{id}/thumbnail — Project thumbnail image
  POST   /api/projects/{id}/export   — Export project to format

EXPORT:
  POST   /api/export                 — Export scene/selection to file format
           body: { format, scope, options }
```

---

### SECTION 14: PERFORMANCE REQUIREMENTS

```
VIEWPORT:
  - 60fps with ≤200 objects / 500K triangles
  - 30fps minimum with ≤1000 objects / 2M triangles
  - Use Level of Detail (LOD) for distant/small objects
  - Use instanced rendering for arrays
  - BVH spatial indexing for raycasting (selection, snapping)
  - Frustum culling (don't render off-screen objects)
  - Occlusion culling where feasible

BOOLEAN OPERATIONS:
  - Simple booleans (two boxes): < 50ms
  - Medium booleans (cylinder from sphere): < 200ms
  - Complex booleans (high-poly imported meshes): < 2 seconds
  - Use Web Workers to avoid blocking UI thread
  - Show progress spinner for operations > 500ms
  - Use WASM-compiled geometry kernels (manifold-3d or similar)

MEMORY:
  - Efficient mesh storage (typed arrays, shared buffers)
  - Dispose Three.js geometries/materials/textures when objects deleted
  - Monitor and display memory usage in status bar
  - Warn user when approaching browser memory limits

STARTUP:
  - Backend server starts in < 5 seconds (without AI model loading)
  - Frontend loads in < 3 seconds
  - AI models loaded ONLY when user initiates first generation
  - AI models fully unloaded after generation completes
```

---

### SECTION 15: ERROR HANDLING & ROBUSTNESS

```
BOOLEAN FAILURES:
  - If CSG operation fails (degenerate geometry, non-manifold input):
    → Show specific error: "Boolean failed: Object B has non-manifold edges. 
       Try 'Repair Mesh' from the right-click menu."
    → Offer auto-repair option
    → Never crash, never leave scene in broken state

IMPORT FAILURES:
  - Corrupted file → "File could not be parsed. It may be corrupted."
  - Unsupported variant → "This FBX version is not supported. Try re-exporting 
    as GLTF from your source application."
  - Massive file → "This model has 5M triangles. Decimate to [slider] for 
    better performance?" with preview

AI FAILURES:
  - OOM → Graceful catch, return partial result if available, show 
    "Insufficient VRAM. Try Shape Only mode or reduce quality."
  - Model not downloaded → "AI models not yet downloaded. Download now? (12GB)"
  - Generation produces bad mesh → Allow user to regenerate or discard
  - Network error during model download → Resume-capable downloads

GENERAL:
  - Auto-save protects against crashes (recover on next launch)
  - All operations wrapped in try-catch with user-friendly messages
  - Never show raw stack traces to user
  - Log all errors to backend log file for debugging
  - Crash reporter: option to send anonymous error reports
```

---

### SECTION 16: FIRST-RUN EXPERIENCE

```
1. User downloads x1cad (installer or Docker)
2. Runs install script / docker-compose up
3. Opens browser to localhost:3000
4. FIRST-RUN WIZARD:
   a. Welcome screen with x1cad branding
   b. System check (auto-detect hardware, show results)
   c. If GPU detected: "Download AI models? (12GB) [Download Now] [Skip]"
   d. Quick tutorial: interactive overlay showing key UI elements
      - "This is the shapes panel — drag shapes to create"
      - "This is the properties panel — edit dimensions here"
      - "Right-click for more options"
      - "Press G to move, R to rotate, S to scale"
      - Skip tutorial option
   e. Create first project or open demo project

DEMO PROJECT:
  Pre-built scene showcasing various features:
  - Several primitive shapes arranged artistically
  - A boolean operation example (shape with holes)
  - An array example
  - Demonstrates what's possible
  - User can edit/delete everything and start fresh
```

---

### SECTION 17: TECH STACK SUMMARY

```
FRONTEND:
  React 18+ / TypeScript / Vite
  Three.js (r160+) for 3D viewport
  three-bvh-csg or manifold-3d (WASM) for Booleans
  Zustand for state management
  Tailwind CSS + Radix UI for interface
  Web Workers for heavy computation

BACKEND:
  Python 3.10 / FastAPI
  Celery + Redis for async AI job queue
  SQLite (default) or PostgreSQL for project metadata
  Hunyuan3D 2.1 (loaded on-demand, unloaded after use)
  Open3D or trimesh for mesh processing
  OpenCascade (via cadquery/build123d) for STEP/IGES support

DEPLOYMENT:
  Docker + docker-compose (primary distribution method)
  Native install script alternative (pip + npm)
  Single-machine, single-user (self-hosted)
  No cloud dependency (fully offline-capable after model download)
```

---

### SECTION 18: QUALITY STANDARDS

```
This is a PRODUCTION-GRADE application. Every feature must be:

  COMPLETE    — No half-implemented features, no "coming soon" placeholders
  ROBUST      — Handles edge cases, bad input, concurrent operations
  RESPONSIVE  — UI never freezes, long operations show progress
  CONSISTENT  — Same interaction patterns throughout the app
  DISCOVERABLE — Features findable via menus, shortcuts, right-click, search
  DOCUMENTED  — Tooltips on every button, keyboard shortcuts in menus,
                help panel with searchable documentation
  TESTED      — Unit tests for geometry operations, integration tests 
                for API, end-to-end tests for critical workflows
  ACCESSIBLE  — Keyboard navigable, high contrast support, screen reader labels
  PERFORMANT  — Profiled and optimized, no memory leaks, smooth 60fps
```

