// Initialize map
const map = L.map("map").setView([14.35, 120.95], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
	maxZoom: 19,
	attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

let jeepneyRoutes = null;
let jeepneyGraph = null;

// Load GeoJSON
fetch("mockDasmaJeepRoute.json")
	.then((response) => response.json())
	.then((data) => {
		jeepneyRoutes = data;
		L.geoJSON(jeepneyRoutes, {
			style: { color: "blue", weight: 4 },
		}).addTo(map);

		jeepneyGraph = buildRouteGraph(jeepneyRoutes);
		console.log("Jeepney routes loaded:", jeepneyRoutes);
	})
	.catch((err) => console.error("Error loading GeoJSON:", err));

// Click to set start and end points
let startMarker = null,
	endMarker = null;

map.on("click", (e) => {
	if (!startMarker) {
		startMarker = L.marker(e.latlng)
			.addTo(map)
			.bindPopup("Start")
			.openPopup();
	} else if (!endMarker) {
		endMarker = L.marker(e.latlng).addTo(map).bindPopup("End").openPopup();
		findNearestRoutes(startMarker.getLatLng(), endMarker.getLatLng());
	} else {
		map.removeLayer(startMarker);
		map.removeLayer(endMarker);
		startMarker = L.marker(e.latlng)
			.addTo(map)
			.bindPopup("Start")
			.openPopup();
		endMarker = null;
	}
});

// Find which jeepney lines are near the start and end points
function findNearestRoutes(start, end) {
	const startPoint = turf.point([start.lng, start.lat]);
	const endPoint = turf.point([end.lng, end.lat]);

	const nearbyStartRoutes = [];
	const nearbyEndRoutes = [];

	for (const feature of jeepneyRoutes.features) {
		const distStart = turf.pointToLineDistance(startPoint, feature, {
			units: "meters",
		});
		const distEnd = turf.pointToLineDistance(endPoint, feature, {
			units: "meters",
		});

		if (distStart < 150) nearbyStartRoutes.push(feature.properties.name);
		if (distEnd < 150) nearbyEndRoutes.push(feature.properties.name);
	}

	const path = findMinimalTransfers(
		jeepneyGraph,
		nearbyStartRoutes,
		nearbyEndRoutes
	);

	if (path) highlightPath(path);

	console.log("Start is near routes:", nearbyStartRoutes);
	console.log("End is near routes:", nearbyEndRoutes);
	console.log("Minimal transfer path:", path);
}

function buildRouteGraph(routes) {
	const graph = {};

	for (let i = 0; i < routes.features.length; i++) {
		const routeA = routes.features[i];
		const nameA = routeA.properties.name;
		graph[nameA] = [];

		for (let j = 0; j < routes.features.length; j++) {
			if (i === j) continue;

			const routeB = routes.features[j];
			const nameB = routeB.properties.name;

			// Detect intersection or near overlap
			const intersection = turf.lineIntersect(routeA, routeB);

			if (intersection.features.length > 0) {
				graph[nameA].push(nameB);
			} else {
				// Optional: detect near connections (within X meters)
				let near = false;
				for (const coord of routeA.geometry.coordinates) {
					const pt = turf.point(coord);
					const dist = turf.pointToLineDistance(pt, routeB, {
						units: "meters",
					});
					if (dist < 50) {
						near = true;
						break;
					}
				}
				if (near) graph[nameA].push(nameB);
			}
		}
	}
	// Clean up duplicate and self connections
	for (const route in graph) {
		graph[route] = [
			...new Set(graph[route].filter((r) => r && r !== route)),
		];
	}

	// Make sure connections are symmetric
	for (const [a, neighbors] of Object.entries(graph)) {
		for (const b of neighbors) {
			if (!graph[b]) graph[b] = [];
			if (!graph[b].includes(a)) graph[b].push(a);
		}
	}

	return graph;
}

// BFS function
function findMinimalTransfers(graph, startRoutes, endRoutes) {
	const queue = [];
	const visited = new Set();

	for (const r of startRoutes) queue.push([r]);

	while (queue.length > 0) {
		const path = queue.shift();
		const last = path[path.length - 1];

		if (endRoutes.includes(last)) return path;

		if (!visited.has(last)) {
			visited.add(last);
			for (const neighbor of graph[last] || []) {
				queue.push([...path, neighbor]);
			}
		}
	}

	return null;
}

function highlightPath(path) {
	if (!jeepneyRoutes) return;

	L.geoJSON(jeepneyRoutes, {
		style: (feature) => {
			if (path.includes(feature.properties.name)) {
				return { color: "red", weight: 5 }; // highlight
			}
			return { color: "gray", weight: 2, opacity: 0.3 }; // dim others
		},
	}).addTo(map);
}
