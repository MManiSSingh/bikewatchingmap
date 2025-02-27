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
  // Add Boston bike lanes source and layer
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
  
  // Add Cambridge bike lanes source and layer
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

  // Select the SVG element appended to the #map container
  const svg = d3.select('#map').select('svg');
  let stations = [];
  let circles;

  // Load station data and create circles with pointer events enabled
  const stationUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
  try {
    const stationData = await d3.json(stationUrl);
    stations = stationData.data.stations;
    circles = svg.selectAll('circle')
      .data(stations, d => d.short_name)
      .enter()
      .append('circle')
      .attr('r', 5)
      .attr('fill', 'steelblue')
      .attr('stroke', 'white')
      .attr('stroke-width', 1)
      .attr('opacity', 0.8)
      .style('pointer-events', 'auto'); // Enable pointer events on circles
    updatePositions();
  } catch (error) {
    console.error('Error loading station JSON:', error);
  }

  // Load trips data from CSV
  let trips;
  try {
    trips = await d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv', trip => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);
      return trip;
    });
  } catch (error) {
    console.error('Error loading traffic CSV:', error);
  }

  // Compute departures and arrivals per station using d3.rollup
  const departures = d3.rollup(
    trips,
    v => v.length,
    d => d.start_station_id
  );
  const arrivals = d3.rollup(
    trips,
    v => v.length,
    d => d.end_station_id
  );

  // Update stations data with departures, arrivals, and total traffic
  stations = stations.map(station => {
    let id = station.short_name;
    station.departures = departures.get(id) ?? 0;
    station.arrivals = arrivals.get(id) ?? 0;
    station.totalTraffic = station.departures + station.arrivals;
    return station;
  });

  // Create a radius scale based on total traffic
  const radiusScale = d3.scaleSqrt()
    .domain([0, d3.max(stations, d => d.totalTraffic)])
    .range([0, 25]);

  // Update circles with new radius and add/update the tooltip (<title> element)
  if (circles) {
    circles
      .data(stations, d => d.short_name)
      .transition().duration(500)
      .attr('r', d => radiusScale(d.totalTraffic));
      
    circles.each(function(d) {
      // Remove any existing <title> to avoid duplicates
      d3.select(this).select('title').remove();
      // Append <title> for browser tooltips displaying trip details
      d3.select(this)
        .append('title')
        .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    });
  }

  updatePositions();

  // Function to project station coordinates to screen space
  function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y };
  }

  // Function to update circle positions based on current map state
  function updatePositions() {
    if (circles) {
      circles
        .attr('cx', d => getCoords(d).cx)
        .attr('cy', d => getCoords(d).cy);
    }
  }

  // Update circle positions on various map events
  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', updatePositions);
  map.on('moveend', updatePositions);
});
