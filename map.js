// Import D3 for data handling (make sure your environment supports ES modules)
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoibWFpbnMiLCJhIjoiY203Zmhva2F6MHFseTJxb2g0M3F4aTUxeiJ9.OnnKTSc4aggZdtZk9wqjdw';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18 // Maximum allowed zoom
});

map.on('load', async () => {
  // ----- Step 2: Adding Bike Lanes -----

  // Boston bike lanes source and layer
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
  });
  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': 'green',
      'line-width': 3,
      'line-opacity': 0.4
    }
  });
  
  // Cambridge bike lanes source and layer
  map.addSource('cambridge_bike_lanes', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
  });
  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge_bike_lanes',
    paint: {
      'line-color': 'green',  
      'line-width': 3,
      'line-opacity': 0.5
    }
  });

  // ----- Step 3: Adding Bike Stations -----
  
  // Load the BlueBikes station data using D3
  let stationData;
  try {
    stationData = await d3.json('https://dsc106.com/labs/lab07/data/bluebikes-stations.json');
    console.log('Loaded station data:', stationData);
  } catch (error) {
    console.error('Error loading station data:', error);
    return;
  }
  
  // Extract stations from the loaded JSON
  // Adjust this line based on your JSON structure (here we check for nested data)
  const stations = stationData.data ? stationData.data.stations : stationData;
  
  // Select the SVG element inside your map container
  const svg = d3.select('#map').select('svg');
  
  // Helper function: Convert a station's geographic coordinates to pixel coordinates
  function getCoords(station) {
    // Adjust property names if necessary; here we use station.Long and station.Lat.
    // You might need to change these to match your data (e.g., station.lon and station.lat)
    const lng = station.Long || station.lon || station.Lng;
    const lat = station.Lat || station.lat;
    const point = new mapboxgl.LngLat(+lng, +lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y };
  }
  
  // Bind station data to circle elements and create markers
  const circles = svg.selectAll('circle')
    .data(stations, d => d.short_name || d.Number)  // Use a unique identifier
    .enter()
    .append('circle')
    .attr('r', 5)                // Marker radius
    .attr('fill', 'steelblue')   // Marker fill color
    .attr('stroke', 'white')     // Marker border color
    .attr('stroke-width', 1)     // Marker border thickness
    .attr('opacity', 0.8);       // Marker opacity
  
  // Function to update station marker positions
  function updatePositions() {
    circles
      .attr('cx', d => getCoords(d).cx)
      .attr('cy', d => getCoords(d).cy);
  }
  
  // Update positions initially and whenever the map moves, zooms, or resizes
  updatePositions();
  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', updatePositions);
  map.on('moveend', updatePositions);
});
