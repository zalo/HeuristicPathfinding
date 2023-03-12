
import * as THREE from 'three';
import { GUI          } from '../node_modules/three/examples/jsm/libs/lil-gui.module.min.js';
import { OBJLoader    } from '../node_modules/three/examples/jsm/loaders/OBJLoader.js';
import { OrbitControls } from '../node_modules/three/examples/jsm/controls/OrbitControls.js';
import { mergeVertices } from '../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';

let container, controls, loader = new OBJLoader(); // ModelLoader
let camera, scene1, renderer, gridHelper, file = {}, material, sphere;
/** @type {THREE.Mesh} */
let mainModel, connections;
/** @type {THREE.Vector3} */
let tmp1 = new THREE.Vector3();
/** @type {THREE.Vector3} */
let tmp2 = new THREE.Vector3();
/** @type {THREE.Vector4} */
let tmp3 = new THREE.Vector4();
/** @type {THREE.Vector3} */
let embeddedSamplePoint = new THREE.Vector3();
/** @type {THREE.BufferAttribute} */
let meshVertices;

/** @type {[[Number]]} */
let distances = [];
/** @type {[THREE.Vector4]} */
let accumulatedDisplacements = [];
let numVertices = 0;
let lastTimeRefreshed = 0;
/** @type {Float32Array} */
let originalModelVerts;// = new Float32Array();
/** @type {Float32Array} */
let embeddedModelVerts;// = new Float32Array();

let raycaster, pointer, pointerLaggy = new THREE.Vector2();

const params = {
  trs: true,
  onlyVisible: true,
  truncateDrawRange: true,
  binary: false,
  maxTextureSize: 4096,
  loadModel: loadModel,
  alpha: 0.0
};

init();
animate();

function init() {
  container = document.createElement( 'div' );
  document.body.appendChild( container );

  scene1 = new THREE.Scene();
  scene1.name = 'Scene1';

  // ---------------------------------------------------------------------
  // Perspective Camera
  // ---------------------------------------------------------------------
  camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 2000 );
  camera.position.set( 60, 40, 40 );

  camera.name = 'PerspectiveCamera';
  scene1.add( camera );

  // ---------------------------------------------------------------------
  // Ambient light
  // ---------------------------------------------------------------------
  const ambientLight = new THREE.AmbientLight( 0xffffff, 0.2 );
  ambientLight.name = 'AmbientLight';
  scene1.add( ambientLight );

  // ---------------------------------------------------------------------
  // DirectLight
  // ---------------------------------------------------------------------
  const dirLight = new THREE.DirectionalLight( 0xffffff, 1 );
  dirLight.target.position.set( 0, 0, - 1 );
  dirLight.add( dirLight.target );
  dirLight.lookAt( - 1, - 1, 0 );
  dirLight.name = 'DirectionalLight';
  scene1.add( dirLight );

  // ---------------------------------------------------------------------
  // Grid
  // ---------------------------------------------------------------------
  gridHelper = new THREE.GridHelper( 2000, 20, 0x222222, 0x444444 );
  gridHelper.position.y = - 10;
  gridHelper.name = 'Grid';
  scene1.add( gridHelper );

  //

  renderer = new THREE.WebGLRenderer( { antialias: true } );
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );

  container.appendChild( renderer.domElement );

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.panSpeed = 2;
  controls.zoomSpeed = 1;
  controls.enableDamping = true;
  controls.dampingFactor = 0.10;
  controls.screenSpacePanning = true;
  controls.update();

  //

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  window.addEventListener('resize', onWindowResize);
  document.addEventListener( 'pointermove', onPointerMove );

  const gui = new GUI();
  gui.add(params, 'loadModel').name('Import Model');
  gui.add(params, "alpha", 0.0, 1.0, 0.001).name('Unfold Amount');
  gui.open();

  sphere = new THREE.Mesh( new THREE.SphereGeometry( 1 ), new THREE.MeshPhysicalMaterial() );
  scene1.add( sphere );

  material = new THREE.MeshPhysicalMaterial({ vertexColors: true });
  material.uniforms = { embeddedSamplePoint : { value: embeddedSamplePoint } };

  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      shader.vertexShader.slice(0, 17) +
      `varying vec3 vPosition; \n` +
      shader.vertexShader.slice(17, - 1) +
      `vPosition = position; }`;

    // Fragment Shader: Set Diffuse Color to Represent Distance to Point
    let indexToInsert = shader.fragmentShader.indexOf("#include <alphamap_fragment>");
    shader.fragmentShader =
    shader.vertexShader.slice(0, 17) +
      `varying vec3 vPosition;
      uniform vec3 embeddedSamplePoint;
      vec3 turbo (in float t) {
          const vec3 a = vec3(0.13830712, 0.49827032, 0.47884378);
          const vec3 b = vec3(0.8581176, -0.50469547, 0.40234273);
          const vec3 c = vec3(0.67796707, 0.84353134, 1.111561);
          const vec3 d = vec3(0.50833158, 1.11536091, 0.76036415);
          vec3 tt = clamp(vec3(t), vec3(0.375, 0.0, 0.0), vec3(1.0, 1.0, 0.7));
          return a + b * cos(6.28318 * (c * tt + d));
      }\n` +
      shader.fragmentShader.substring(17, indexToInsert) +
      `
      float d = distance(vColor, embeddedSamplePoint) * 1.5;
      diffuseColor.rgb = turbo(d);
      //diffuseColor.rgb = normalize(diffuseColor.rgb);
      //diffuseColor.rgb *= 1.0 - exp(-4.0*abs(d));
      diffuseColor.rgb *= 0.8 + 0.2*cos(450.0*d);
      ` + shader.fragmentShader.substring(indexToInsert);

    // Set the sample point into the model
    shader.uniforms.embeddedSamplePoint = material.uniforms.embeddedSamplePoint;
  };

  loader.load("../assets/SimpleLevel.obj",
    (model) => {
      
      model.traverse((child) => {
        if (child.isMesh) {
          child.material = material;
          mainModel = child;
          mainModel.position.set(  0, -10, 20 );
          mainModel.scale   .set(200, 200, 200);
          scene1.add(mainModel);
          return;
        }
      });
    },
    (progress) => { /*console.log(progress);*/ },
    (error) => { console.error(error); });
}

function onPointerMove( event ) {
  pointer.x =   ( event.clientX / window.innerWidth  ) * 2 - 1;
  pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
}

async function getNewFileHandle(desc, mime, extensions, open = false) {
  const options = {
    types: [
      { description: desc, accept: { [mime]: extensions} },
    ],
  };
  if (open) { return await window.showOpenFilePicker(options);
  }   else  { return await window.showSaveFilePicker(options); }
}

async function loadModel() {
  // Load Project .json from a file
  [file.handle] = await getNewFileHandle(
    '3D Model Files', 'application/octet-stream', [".obj", ".OBJ"], open = true);
  let fileSystemFile = await file.handle.getFile();
  let fileURL        = URL.createObjectURL(fileSystemFile);//await fileSystemFile.text();

  loader.load(fileURL,
    (model) => {
      model.traverse((child) => {
        if (child.isMesh) {
          connections = null;
          mainModel = child;
          child.material = material;
          mainModel.position.set(  0, -10, 20 );
          mainModel.scale   .set(200, 200, 200);
          scene1.add(mainModel);
        }
      });
      
    },
    (progress) => { /*console.log(progress);*/ },
    (error) => { console.error(error); });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize( window.innerWidth, window.innerHeight );
}

function animate(time) {
  requestAnimationFrame( animate );
  render(time);
}

/** @param {THREE.Mesh} mesh */
function calculateDistanceMatrix(mesh) {
  // Collapse Vertices
  mesh.geometry = mergeVertices(mesh.geometry, 0.01);
  mesh.geometry.computeVertexNormals();

  meshVertices = mesh.geometry.getAttribute('position');
  numVertices = meshVertices.count;
  let indices = mesh.geometry.index;

  originalModelVerts = new Float32Array(meshVertices.array);
  embeddedModelVerts = new Float32Array(meshVertices.array);

  mesh.geometry.setAttribute('color', new THREE.BufferAttribute(embeddedModelVerts, 3, false));

  // Allocate space for all our datastructures
  connections = [];
  distances   = [];
  accumulatedDisplacements = [];
  for (let i = 0; i < numVertices; i++) {
    distances.push([]);
    connections.push(new Set());
    accumulatedDisplacements.push(new THREE.Vector4());
    for (let j = 0; j < numVertices; j++) {
      distances[i].push(10000.0);
    }
  }

  // Reprocess the mesh into a graph with a set of connections at each vertex
  let numIndices = mesh.geometry.index.array.length;
  for (let i = 0; i < numIndices; i += 3) {
      connections[indices.array[i    ]].add(indices.array[i + 1]);
      connections[indices.array[i    ]].add(indices.array[i + 2]);
      connections[indices.array[i + 1]].add(indices.array[i    ]);
      connections[indices.array[i + 1]].add(indices.array[i + 2]);
      connections[indices.array[i + 2]].add(indices.array[i    ]);
      connections[indices.array[i + 2]].add(indices.array[i + 1]);
  }

  // Traverse the graph, calculate the n-squared distance matrix
  for (let i = 0; i < numVertices; i++) { depthFirstTraversal(i, i, 0); }
}

/// Depth-First Traversal of Node-Graph; horribly inefficient, should be breadth-first
function depthFirstTraversal(startingNode, currentNode, currentDistance) {
  if (currentDistance <= distances[startingNode][currentNode]) {
    distances[startingNode][currentNode] = currentDistance;
    //for (let connection in connections[currentNode]) {
    connections[currentNode].forEach((connection) => {
      if (connection != startingNode && connection != currentNode) {
        depthFirstTraversal(startingNode, connection, currentDistance +
          //Vector3.Distance(mesh.vertices[currentNode], mesh.vertices[connection]));
          tmp1.set(meshVertices.getX(currentNode), meshVertices.getY(currentNode), meshVertices.getZ(currentNode)).distanceTo(
            tmp2.set(meshVertices.getX(connection), meshVertices.getY(connection), meshVertices.getZ(connection))
          ));
      }
    });
  }
}

function render(time) {
  const timer = time;

  if (!connections && mainModel) {
    calculateDistanceMatrix(mainModel);
    lastTimeRefreshed = time;
  }

  let outputSpaceScale = 1.0;
  if (connections && mainModel) {
    let modelVerts = mainModel.geometry.getAttribute('position');
    modelVerts.array.set(embeddedModelVerts);

    // First sum up each node's effect on each other
    for (let i = 0; i < numVertices - 1; i++) {
      for (let j = i + 1; j < numVertices; j++) {
        let sqrDistance = distances[i][j] * outputSpaceScale; sqrDistance = sqrDistance * sqrDistance;
        if (sqrDistance > 0.0) {
          let offset = tmp1.set(modelVerts.getX(j) - modelVerts.getX(i),
                                modelVerts.getY(j) - modelVerts.getY(i),
                                modelVerts.getZ(j) - modelVerts.getZ(i))
          offset.multiplyScalar(sqrDistance / (offset.dot(offset) + sqrDistance) - 0.5);
          accumulatedDisplacements[i].add(tmp3.set(-offset.x, -offset.y, -offset.z, 1.0));
          accumulatedDisplacements[j].add(tmp3.set( offset.x,  offset.y,  offset.z, 1.0));
        }
      }
    }

    // Then average them and apply - Jacobi style
    for (let i = 0; i < numVertices; i++) {
      if (accumulatedDisplacements[i].w > 0) {
        tmp1.set(
          accumulatedDisplacements[i].x,
          accumulatedDisplacements[i].y,
          accumulatedDisplacements[i].z).divideScalar(
            //accumulatedDisplacements[i].w);
            accumulatedDisplacements[i].w);//Math.max(1.0, 25.0 - ((time - lastTimeRefreshed) * 8.0))); // Aesthetic Slow Unrolling...
        modelVerts.setXYZ(i,
          modelVerts.getX(i) + tmp1.x,
          modelVerts.getY(i) + tmp1.y,
          modelVerts.getZ(i) + tmp1.z);
      }
      accumulatedDisplacements[i].set(0, 0, 0, 0);
    }
    embeddedModelVerts.set(modelVerts.array);
    //modelVerts.array.set(originalModelVerts);

    let t = params.alpha;
    for (let i = 0; i < numVertices; i++) {
      modelVerts.array[(i * 3) + 0] =  ((1.0-t) * originalModelVerts[(i * 3) + 0]) + (t * embeddedModelVerts[(i * 3) + 0]);
      modelVerts.array[(i * 3) + 1] =  ((1.0-t) * originalModelVerts[(i * 3) + 1]) + (t * embeddedModelVerts[(i * 3) + 1]);
      modelVerts.array[(i * 3) + 2] =  ((1.0-t) * originalModelVerts[(i * 3) + 2]) + (t * embeddedModelVerts[(i * 3) + 2]);
    }
    modelVerts.needsUpdate = true;
    mainModel.geometry.getAttribute('color').needsUpdate = true;
    mainModel.geometry.computeVertexNormals();
    mainModel.geometry.computeBoundingBox();
    mainModel.geometry.computeBoundingSphere();

    // Raycast to the model and interpolate the embedded hit point!
    pointerLaggy.x -= (pointerLaggy.x - pointer.x) * 0.25;
    pointerLaggy.y -= (pointerLaggy.y - pointer.y) * 0.25;

    raycaster.setFromCamera( pointer, camera );
    let intersects = raycaster.intersectObject(mainModel);
    if (intersects.length > 0 && embeddedModelVerts) {
      /** @type {THREE.Intersection} */
      let intersection = intersects[0];
      sphere.position.copy(intersection.point);
      mainModel.worldToLocal(tmp1.copy(intersection.point));
      tmp2 = THREE.Triangle.getBarycoord(tmp1,
        new THREE.Vector3(
          modelVerts.array[(intersection.face.a * 3) + 0],
          modelVerts.array[(intersection.face.a * 3) + 1],
          modelVerts.array[(intersection.face.a * 3) + 2]),
        new THREE.Vector3(
          modelVerts.array[(intersection.face.b * 3) + 0],
          modelVerts.array[(intersection.face.b * 3) + 1],
          modelVerts.array[(intersection.face.b * 3) + 2]),
        new THREE.Vector3(
          modelVerts.array[(intersection.face.c * 3) + 0],
          modelVerts.array[(intersection.face.c * 3) + 1],
          modelVerts.array[(intersection.face.c * 3) + 2]), tmp2);
      
      let emb1 = new THREE.Vector3(
        embeddedModelVerts[(intersection.face.a * 3) + 0],
        embeddedModelVerts[(intersection.face.a * 3) + 1],
        embeddedModelVerts[(intersection.face.a * 3) + 2]);
      let emb2 = new THREE.Vector3(
        embeddedModelVerts[(intersection.face.b * 3) + 0],
        embeddedModelVerts[(intersection.face.b * 3) + 1],
        embeddedModelVerts[(intersection.face.b * 3) + 2]);
      let emb3 = new THREE.Vector3(
        embeddedModelVerts[(intersection.face.c * 3) + 0],
        embeddedModelVerts[(intersection.face.c * 3) + 1],
        embeddedModelVerts[(intersection.face.c * 3) + 2]);
      embeddedSamplePoint.set( 0, 0, 0 );
      embeddedSamplePoint.addScaledVector(emb1, tmp2.x);
      embeddedSamplePoint.addScaledVector(emb2, tmp2.y);
      embeddedSamplePoint.addScaledVector(emb3, tmp2.z);
      material.uniforms.embeddedSamplePoint.value = embeddedSamplePoint;
      material.needsUpdate = true;
      material.unirformsNeedUpdate = true;
    }

  }

  controls.update();
  renderer.render( scene1, camera );
}
