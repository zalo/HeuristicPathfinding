# [HeuristicPathfinding](https://zalo.github.io/HeuristicPathfinding/)

<p align="left">
  <a href="https://github.com/zalo/HeuristicPathfinding/deployments/activity_log?environment=github-pages">
      <img src="https://github.com/zalo/HeuristicPathfinding/actions/workflows/main.yml/badge.svg" title="Github Pages Deployment"></a>
  <a href="https://github.com/zalo/HeuristicPathfinding/commits/master">
      <img src="https://img.shields.io/github/last-commit/zalo/HeuristicPathfinding" title="Last Commit Date"></a>
  <!--<a href="https://github.com/zalo/HeuristicPathfinding/blob/master/LICENSE">
      <img src="https://img.shields.io/github/license/zalo/HeuristicPathfinding" title="License: Apache V2"></a> -->
</p>

Visualizing the different ways of embedding traversable manifolds for pathfinding.

 # Building

This testbed can either be run without building (in Chrome/Edge/Opera since raw three.js examples need [Import Maps](https://caniuse.com/import-maps)), or built with:
```
npm install
npm run build
```
If building manually, make sure to edit the index .html to point from `"./src/main.js"` to `"./build/main.js"`.

 # Dependencies
 - [three.js](https://github.com/mrdoob/three.js/) (3D Rendering Engine)
 - [esbuild](https://github.com/evanw/esbuild/) (Bundler)
