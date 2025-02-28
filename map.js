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
  map.addSource('boston_route', { type: 'geojson', data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson' });
  map.addLayer({ id: 'bike-lanes', type: 'line', source: 'boston_route', paint: { 'line-color': 'green', 'line-width': 3, 'line-opacity': 0.4 } });
  map.addSource('cambridge_bike_lanes', { type: 'geojson', data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson' });
  map.addLayer({ id: 'cambridge-bike-lanes', type: 'line', source: 'cambridge_bike_lanes', paint: { 'line-color': 'green', 'line-width': 3, 'line-opacity': 0.5 } });
  
  const svg = d3.select('#map').select('svg');
  let stations = [];
  let circles;
  let trips = [];
  let timeFilter = -1;
  let departuresByMinute = Array.from({ length: 1440 }, () => []);
  let arrivalsByMinute = Array.from({ length: 1440 }, () => []);
  
  function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
  }
  function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
  }
  
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
    const updatedStations = filterTripsAndComputeAggregates();
    updateCircles(updatedStations);
  }
  timeSlider.addEventListener('input', updateTimeDisplay);
  updateTimeDisplay();

  const stationUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
  try {
    const stationData = await d3.json(stationUrl);
    stations = stationData.data.stations;
    circles = svg.selectAll('circle')
      .data(stations, d => d.short_name)
      .enter()
      .append('circle')
      .attr('r', 5)
      .attr('stroke', 'white')
      .attr('stroke-width', 1)
      .attr('opacity', 0.8)
      .style('pointer-events', 'auto');
    updatePositions();
  } catch (error) {
    console.error(error);
  }

  try {
    trips = await d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv', trip => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);
      return trip;
    });
    for (let trip of trips) {
      let startMin = minutesSinceMidnight(trip.started_at);
      departuresByMinute[startMin].push(trip);
      let endMin = minutesSinceMidnight(trip.ended_at);
      arrivalsByMinute[endMin].push(trip);
    }
  } catch (error) {
    console.error(error);
  }

  function filterByMinute(tripsByMinute, minute) {
    let minMinute = (minute - 60 + 1440) % 1440;
    let maxMinute = (minute + 60) % 1440;
    if (minMinute > maxMinute) {
      let beforeMidnight = tripsByMinute.slice(minMinute);
      let afterMidnight = tripsByMinute.slice(0, maxMinute);
      return beforeMidnight.concat(afterMidnight).flat();
    } else {
      return tripsByMinute.slice(minMinute, maxMinute).flat();
    }
  }

  function filterTripsAndComputeAggregates() {
    if (timeFilter === -1) return computeAggregates(trips);
    else {
      const filteredDepartureTrips = filterByMinute(departuresByMinute, timeFilter);
      const filteredArrivalTrips = filterByMinute(arrivalsByMinute, timeFilter);
      const filteredDepartures = d3.rollup(filteredDepartureTrips, v => v.length, d => d.start_station_id);
      const filteredArrivals = d3.rollup(filteredArrivalTrips, v => v.length, d => d.end_station_id);
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

  function computeAggregates(tripData) {
    const departures = d3.rollup(tripData, v => v.length, d => d.start_station_id);
    const arrivals = d3.rollup(tripData, v => v.length, d => d.end_station_id);
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

  const stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

  function updateCircles(stationData) {
    const radiusScale = d3.scaleSqrt()
      .domain([0, d3.max(stationData, d => d.totalTraffic)])
      .range(timeFilter === -1 ? [0, 15] : [2, 20]);
    circles = svg.selectAll('circle')
      .data(stationData, d => d.short_name)
      .join('circle')
      .attr('stroke', 'white')
      .attr('stroke-width', 1)
      .attr('opacity', 0.8)
      .attr('r', d => radiusScale(d.totalTraffic))
      .style('pointer-events', 'auto')
      .style('--departure-ratio', d => {
        if (d.totalTraffic === 0) return 0.5;
        return stationFlow(d.departures / d.totalTraffic);
      });
    circles.selectAll('title').remove();
    circles.append('title')
      .text(d => `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    updatePositions();
  }

  function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y };
  }

  function updatePositions() {
    if (circles) {
      circles.attr('cx', d => getCoords(d).cx)
             .attr('cy', d => getCoords(d).cy);
    }
  }

  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', updatePositions);
  map.on('moveend', updatePositions);
});
