mapboxgl.accessToken = 'pk.eyJ1IjoibWFpbnMiLCJhIjoiY203Zmhva2F6MHFseTJxb2g0M3F4aTUxeiJ9.OnnKTSc4aggZdtZk9wqjdw';

const map = new mapboxgl.Map({
  container: 'map', 
  style: 'mapbox://styles/mapbox/streets-v12', 
  center: [-71.09415, 42.36027], 
  zoom: 12, 
  minZoom: 5, 
  maxZoom: 18 
});

map.on('load', async () => {
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

  const svg = d3.select('#map').select('svg');
  let stations = [];

  const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
  d3.json(jsonurl).then(jsonData => {
    const stations = jsonData.data.stations;
    console.log('Stations Array:', stations);
    console.log('Loaded JSON Data:', jsonData); 
  }).catch(error => {
    console.error('Error loading JSON:', error); 
  });

  map.on('move', updatePositions);    
  map.on('zoom', updatePositions);   
  map.on('resize', updatePositions);
  map.on('moveend', updatePositions); 

  function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y }; }

  function updatePositions() {
    circles
    .attr('cx', d => getCoords(d).cx)  
    .attr('cy', d => getCoords(d).cy); 
    }
  
});
