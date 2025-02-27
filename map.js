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
  let trips = [];

  // ----------------------
  // INTERACTIVE FILTER SETUP
  // ----------------------
  // Global variable: -1 means no filtering
  let timeFilter = -1;

  // Helper to format minutes as a time string (HH:MM AM/PM)
  function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
  }

  // Helper to get minutes since midnight for a given Date
  function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
  }

  // Select slider and display elements (assumed present in your HTML)
  const timeSlider = document.getElementById('time-slider');
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  // Update the time display and re-filter the data when slider moves
  function updateTimeDisplay() {
    timeFilter = Number(timeSlider.value);
    if (timeFilter === -1) {
      selectedTime.textContent = '';
      anyTimeLabel.style.display = 'block';
    } else {
      selectedTime.textContent = formatTime(timeFilter);
      anyTimeLabel.style.display = 'none';
    }
    // Recompute aggregates using the filter
    const { filteredStations } = filterTripsByTime();
    updateCircles(filteredStations);
  }
  timeSlider.addEventListener('input', updateTimeDisplay);
  updateTimeDisplay();

  // ----------------------
  // LOAD DATA AND INITIAL RENDER
  // ----------------------
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

  // Load trips data from CSV and convert time strings to Date objects
  try {
    trips = await d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv', trip => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);
      return trip;
    });
  } catch (error) {
    console.error('Error loading traffic CSV:', error);
  }

  // ----------------------
  // AGGREGATION & FILTERING LOGIC
  // ----------------------
  // Computes departures/arrivals and updates station objects
  function computeAggregates(tripData) {
    const departures = d3.rollup(
      tripData,
      v => v.length,
      d => d.start_station_id
    );
    const arrivals = d3.rollup(
      tripData,
      v => v.length,
      d => d.end_station_id
    );
    // Create a new array of station objects with updated counts (clone to avoid mutation)
    let updatedStations = stations.map(station => {
      let newStation = { ...station };
      let id = station.short_name;
      newStation.departures = departures.get(id) ?? 0;
      newStation.arrivals = arrivals.get(id) ?? 0;
      newStation.totalTraffic = newStation.departures + newStation.arrivals;
      return newStation;
    });
    return updatedStations;
  }

  // Filters trips based on timeFilter.
  // If timeFilter is -1, no filtering is applied.
  // Otherwise, include trips that started or ended within 60 minutes of timeFilter.
  function filterTripsByTime() {
    if (timeFilter === -1) {
      return { filteredStations: computeAggregates(trips) };
    } else {
      const filteredTrips = trips.filter(trip => {
        const startMin = minutesSinceMidnight(trip.started_at);
        const endMin = minutesSinceMidnight(trip.ended_at);
        return (Math.abs(startMin - timeFilter) <= 60 ||
                Math.abs(endMin - timeFilter) <= 60);
      });
      return { filteredStations: computeAggregates(filteredTrips) };
    }
  }

  // ----------------------
  // UPDATE VISUALIZATION
  // ----------------------
  // Update circles based on station data (filtered or full)
  function updateCircles(stationData) {
    // Adjust radius scale based on whether filtering is active
    const radiusScale = d3.scaleSqrt()
      .domain([0, d3.max(stationData, d => d.totalTraffic)])
      .range(timeFilter === -1 ? [0, 25] : [3, 50]);
    
    circles = svg.selectAll('circle')
      .data(stationData, d => d.short_name)
      .join('circle')
      .attr('fill', 'orangered')
      .attr('stroke', 'white')
      .attr('stroke-width', 1)
      .attr('opacity', 0.8)
      .attr('r', d => radiusScale(d.totalTraffic))
      .style('pointer-events', 'auto');

    // Update tooltips
    circles.selectAll('title').remove();
    circles.append('title')
      .text(d => `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    updatePositions();
  }

  // Projects station coordinates to screen space
  function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y };
  }

  // Update circle positions on the map
  function updatePositions() {
    if (circles) {
      circles.attr('cx', d => getCoords(d).cx)
             .attr('cy', d => getCoords(d).cy);
    }
  }

  // Reposition circles on various map events
  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', updatePositions);
  map.on('moveend', updatePositions);
});
