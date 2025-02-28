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
  // ----------------------
  // MAP LAYERS
  // ----------------------
  // Boston bike lanes
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
  
  // Cambridge bike lanes
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

  // ----------------------
  // GLOBAL VARIABLES & HELPER FUNCTIONS
  // ----------------------
  const svg = d3.select('#map').select('svg');
  let stations = [];
  let circles;
  let trips = [];

  // Global filter: -1 indicates no filtering
  let timeFilter = -1;

  // Pre-bucket arrays: one for each minute of the day (0–1439)
  let departuresByMinute = Array.from({ length: 1440 }, () => []);
  let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

  // Helper: Convert minutes (0–1439) into formatted time (HH:MM AM/PM)
  function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
  }
  // Helper: Compute minutes since midnight for a Date object
  function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
  }
  
  // ----------------------
  // SLIDER ELEMENTS & REACTIVITY
  // ----------------------
  // (Ensure in your HTML the slider's max is set to 1439.)
  const timeSlider = document.getElementById('time-slider');
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  function updateTimeDisplay() {
    timeFilter = Number(timeSlider.value);
    if (timeFilter === -1) {
      selectedTime.textContent = '';
      anyTimeLabel.style.display = 'block';
    } else {
      selectedTime.textContent = formatTime(timeFilter);
      anyTimeLabel.style.display = 'none';
    }
    // When the slider updates, filter trips and update circles.
    const updatedStations = filterTripsAndComputeAggregates();
    updateCircles(updatedStations);
  }
  timeSlider.addEventListener('input', updateTimeDisplay);
  updateTimeDisplay(); // Initialize display

  // ----------------------
  // DATA LOADING
  // ----------------------
  // Load station data and render initial circles
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
      .style('pointer-events', 'auto'); // Enable tooltips
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
    // Pre-bucket each trip by its start and end minute
    for (let trip of trips) {
      let startMin = minutesSinceMidnight(trip.started_at);
      departuresByMinute[startMin].push(trip);
      
      let endMin = minutesSinceMidnight(trip.ended_at);
      arrivalsByMinute[endMin].push(trip);
    }
  } catch (error) {
    console.error('Error loading traffic CSV:', error);
  }

  // ----------------------
  // FILTERING & AGGREGATION FUNCTIONS
  // ----------------------
  // Helper function to filter trips from bucket arrays (handles window spanning midnight)
  function filterByMinute(tripsByMinute, minute) {
    let minMinute = (minute - 60 + 1440) % 1440;
    let maxMinute = (minute + 60) % 1440;
    if (minMinute > maxMinute) {
      // Window spans midnight: combine slices before and after midnight
      let beforeMidnight = tripsByMinute.slice(minMinute);
      let afterMidnight = tripsByMinute.slice(0, maxMinute);
      return beforeMidnight.concat(afterMidnight).flat();
    } else {
      return tripsByMinute.slice(minMinute, maxMinute).flat();
    }
  }

  // Compute aggregates based on filtered trips using buckets.
  // If no filter is applied, compute aggregates over all trips.
  function filterTripsAndComputeAggregates() {
    if (timeFilter === -1) {
      return computeAggregates(trips);
    } else {
      const filteredDepartureTrips = filterByMinute(departuresByMinute, timeFilter);
      const filteredArrivalTrips = filterByMinute(arrivalsByMinute, timeFilter);
      
      const filteredDepartures = d3.rollup(
        filteredDepartureTrips,
        v => v.length,
        d => d.start_station_id
      );
      const filteredArrivals = d3.rollup(
        filteredArrivalTrips,
        v => v.length,
        d => d.end_station_id
      );
      
      // Clone stations and update with filtered counts.
      const updatedStations = stations.map(station => {
        const id = station.short_name;
        let newStation = { ...station };
        newStation.departures = filteredDepartures.get(id) ?? 0;
        newStation.arrivals = filteredArrivals.get(id) ?? 0;
        newStation.totalTraffic = newStation.departures + newStation.arrivals;
        return newStation;
      });
      return updatedStations;
    }
  }

  // Compute aggregates over a given array of trips (used when no filter is active)
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
    const updatedStations = stations.map(station => {
      const id = station.short_name;
      let newStation = { ...station };
      newStation.departures = departures.get(id) ?? 0;
      newStation.arrivals = arrivals.get(id) ?? 0;
      newStation.totalTraffic = newStation.departures + newStation.arrivals;
      return newStation;
    });
    return updatedStations;
  }

  // ----------------------
  // VISUALIZATION UPDATES
  // ----------------------
  function updateCircles(stationData) {
    // Adjust circle radius scale:
    // When no filter is applied, use a range of [0, 15];
    // When filtering, use a slightly larger range [2, 20] to enhance visibility.
    const radiusScale = d3.scaleSqrt()
      .domain([0, d3.max(stationData, d => d.totalTraffic)])
      .range(timeFilter === -1 ? [0, 15] : [2, 20]);
    
    circles = svg.selectAll('circle')
      .data(stationData, d => d.short_name)
      .join('circle')
      .attr('fill', 'steelblue')
      .attr('stroke', 'white')
      .attr('stroke-width', 1)
      .attr('opacity', 0.8)
      .attr('r', d => radiusScale(d.totalTraffic))
      .style('pointer-events', 'auto');

    // Update tooltips with the current trip counts
    circles.selectAll('title').remove();
    circles.append('title')
      .text(d => `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    
    updatePositions();
  }

  // Project station coordinates into screen space
  function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y };
  }

  // Update circle positions based on the current map view
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
