/**
 * Heritage WebGIS Application
 * A mobile-friendly WebGIS application for displaying heritage sites
 */

// Main application namespace
const HeritageApp = {
  // Configuration
  config: {
    map: {
      center: [12.9716, 77.5946], // Bengaluru coordinates
      zoom: 9,
      zoomControl: false
    },
    urls: {
      inscriptions: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRmsBKzbk4bkTTFvv3CUEmTnQd6mqQfdkixHmMkdH4jYpQTMj7w-3SXPeryptu9aXEjtw3EQxJpHK3d/pub?gid=881294641&single=true&output=csv',
      herostones: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRHCFT5jA5VPInkSC9eqeDSJ43pEbAh0zFoz31CFn876VzFuUFobc9nTc1J068ilw/pub?gid=115817771&single=true&output=csv',
      temples: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSXXg4VXox3vI4MDq72UImHgMdTADZVFDX0kSHIZqqw0ZAq2FTaj2JHXkvvBdksKDh_2ysT9AseQqUl/pub?gid=0&single=true&output=csv'
    }
  },
  
  // Map elements
  map: null,
  baseLayers: {},
  overlays: {
    inscriptions: L.layerGroup(),
    herostones: L.layerGroup(),
    temples: L.layerGroup()
  },
  // Store markers by layer for clustering/unclustering
  markersByLayer: {
    inscriptions: [],
    herostones: [],
    temples: []
  },
  // Store all markers with searchable data
  allMarkersData: [],
  // Track highlighted markers
  highlightedMarkers: [],
  markerCluster: null,
  layerControl: null,
  
  /**
   * Initialize the application
   */
  init: function() {
    this.initMap();
    this.initUI();
    this.loadData();
  },
  
  /**
   * Initialize the map and its components
   */
  initMap: function() {
    // Create the map
    this.map = L.map('map', { 
      zoomControl: this.config.map.zoomControl 
    }).setView(this.config.map.center, this.config.map.zoom);
    
    // Create base layers (OSM only)
    this.baseLayers = {
      "OSM": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OSM',
        opacity: 0.7
      })
    };
    
    // Add OSM basemap by default
    this.baseLayers["OSM"].addTo(this.map);
    // Add scale control to bottom left
    L.control.scale({ position: 'bottomleft' }).addTo(this.map);
    // Hide default attribution control
    this.map.attributionControl.setPrefix("");
    this.map.attributionControl.setPosition('bottomright');
    document.querySelector('.leaflet-control-attribution').style.display = 'none';
    // Enable clustering and heritage layers by default with zoom-dependent radius
    this.markerCluster = L.markerClusterGroup({
      maxClusterRadius: function(zoom) {
        // Hybrid approach: larger radius at lower zoom, smaller at higher zoom
        // Zoom 1-8: Very zoomed out (country/region level) - large clusters
        // Zoom 9-12: City level - medium clusters
        // Zoom 13-15: Neighborhood level - smaller clusters
        // Zoom 16+: Street level - very small clusters
        if (zoom <= 8) return 120;      // Large clusters for overview
        if (zoom <= 11) return 80;      // Medium clusters for city view
        if (zoom <= 14) return 50;      // Smaller clusters for neighborhood
        if (zoom <= 17) return 30;      // Small clusters for street level
        return 20;                       // Very small clusters when zoomed in
      },
      spiderfyOnMaxZoom: true,          // Show spider layout at max zoom
      showCoverageOnHover: false,       // Don't show cluster bounds on hover
      zoomToBoundsOnClick: true,        // Zoom to show all markers on click
      disableClusteringAtZoom: 19,      // Disable clustering at zoom 19+ (very close)
      spiderLegPolylineOptions: {       // Style for spider legs
        weight: 1.5,
        color: '#72383D',
        opacity: 0.6
      },
      iconCreateFunction: function(cluster) {
        // Count markers by heritage type
        const markers = cluster.getAllChildMarkers();
        const counts = { inscriptions: 0, herostones: 0, temples: 0 };
        
        markers.forEach(marker => {
          const icon = marker.options.icon;
          if (icon && icon.options && icon.options.className) {
            const className = icon.options.className;
            if (className.includes('marker-inscriptions')) counts.inscriptions++;
            else if (className.includes('marker-herostones')) counts.herostones++;
            else if (className.includes('marker-temples')) counts.temples++;
          }
        });
        
        const total = counts.inscriptions + counts.herostones + counts.temples;
        
        // Create donut chart SVG
        const size = 50;
        const center = size / 2;
        const radius = 18;
        const innerRadius = 12;
        
        // Calculate percentages and create pie slices
        let currentAngle = -90; // Start from top
        const colors = {
          inscriptions: '#d32f2f',  // dark red - matches marker color
          herostones: '#388e3c',    // dark green - matches marker color
          temples: '#303f9f'        // dark blue - matches marker color
        };
        
        let paths = '';
        Object.keys(counts).forEach(type => {
          if (counts[type] > 0) {
            const percentage = counts[type] / total;
            const angle = percentage * 360;
            const endAngle = currentAngle + angle;
            
            // Create donut segment path
            const startRad = (currentAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;
            
            const x1 = center + radius * Math.cos(startRad);
            const y1 = center + radius * Math.sin(startRad);
            const x2 = center + radius * Math.cos(endRad);
            const y2 = center + radius * Math.sin(endRad);
            const x3 = center + innerRadius * Math.cos(endRad);
            const y3 = center + innerRadius * Math.sin(endRad);
            const x4 = center + innerRadius * Math.cos(startRad);
            const y4 = center + innerRadius * Math.sin(startRad);
            
            const largeArc = angle > 180 ? 1 : 0;
            
            paths += `<path d="M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z" fill="${colors[type]}" stroke="#fff" stroke-width="1"/>`;
            
            currentAngle = endAngle;
          }
        });
        
        const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
          ${paths}
          <circle cx="${center}" cy="${center}" r="${innerRadius}" fill="white"/>
          <text x="${center}" y="${center}" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="bold" fill="#333">${total}</text>
        </svg>`;
        
        return L.divIcon({
          html: svg,
          className: 'marker-cluster-donut',
          iconSize: L.point(size, size)
        });
      }
    });
    this.clusteringEnabled = true;
    this.setupLayerControl();
    // Add all overlays to map so checkboxes are checked by default
    Object.values(this.overlays).forEach(layer => this.map.addLayer(layer));
    // Note: markerCluster will be added after data loads (when we have markers)
    
    // Add custom toggle switch control below layer control
    const self = this;
    this.clusteringEnabled = true;
    const ToggleControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function(map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-toggle');
        container.innerHTML = `
          <button id="icon-toggle-switch" class="icon-toggle-switch" aria-label="Toggle Clustering">
            <span class="material-symbols-outlined toggle-icon toggle-cluster">graph_6</span>
          </button>
        `;
        L.DomEvent.disableClickPropagation(container);
        container.querySelector('#icon-toggle-switch').addEventListener('click', function() {
          self.toggleClusteringControl(container);
        });
        return container;
      }
    });
    this.toggleControl = new ToggleControl();
    this.map.addControl(this.toggleControl);
    
    // Add GPS location control below clustering toggle
    const LocationControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function(map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-location');
        container.innerHTML = `
          <button id="gps-locate-btn" class="gps-locate-btn" aria-label="Find My Location">
            <i class="bi bi-crosshair"></i>
          </button>
        `;
        L.DomEvent.disableClickPropagation(container);
        container.querySelector('#gps-locate-btn').addEventListener('click', function() {
          self.getCurrentLocation();
        });
        return container;
      }
    });
    this.locationControl = new LocationControl();
    this.map.addControl(this.locationControl);
    
    // Store current location marker
    this.currentLocationMarker = null;
  },

  /**
   * Get current GPS location
   */
  getCurrentLocation: function() {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    
    // Show loading state
    const btn = document.getElementById('gps-locate-btn');
    if (btn) {
      btn.classList.add('loading');
      btn.disabled = true;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.lat;
        const lng = position.coords.lng;
        const accuracy = position.coords.accuracy;
        
        console.log('Current location:', lat, lng, 'Accuracy:', accuracy, 'm');
        
        // Remove loading state
        if (btn) {
          btn.classList.remove('loading');
          btn.disabled = false;
        }
        
        // Show location on map
        this.showCurrentLocation(lat, lng, accuracy);
      },
      (error) => {
        // Remove loading state
        if (btn) {
          btn.classList.remove('loading');
          btn.disabled = false;
        }
        
        let errorMsg = 'Unable to get your location';
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Location permission denied. Please enable location access.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Location information unavailable.';
            break;
          case error.TIMEOUT:
            errorMsg = 'Location request timed out.';
            break;
        }
        alert(errorMsg);
        console.error('Geolocation error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  },
  
  /**
   * Show current location on map
   */
  showCurrentLocation: function(lat, lng, accuracy) {
    // Remove previous location marker if exists
    if (this.currentLocationMarker) {
      this.map.removeLayer(this.currentLocationMarker);
    }
    
    // Create location marker with pulsing blue dot
    this.currentLocationMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        html: '<div class="current-location-marker"><div class="pulse"></div><div class="dot"></div></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10],
        className: 'current-location-icon'
      }),
      zIndexOffset: 2000
    });
    
    // Add popup with location info
    this.currentLocationMarker.bindPopup(`
      <b>Your Location</b><br>
      Latitude: ${lat.toFixed(6)}<br>
      Longitude: ${lng.toFixed(6)}<br>
      <small>Accuracy: ±${Math.round(accuracy)}m</small>
    `);
    
    // Add to map
    this.currentLocationMarker.addTo(this.map);
    
    // Zoom to location
    this.map.setView([lat, lng], 15, {
      animate: true,
      duration: 1
    });
    
    // Open popup
    setTimeout(() => {
      this.currentLocationMarker.openPopup();
    }, 500);
  },

  /**
   * Enable clustering for visible heritage layers
   */
  enableClusteringForVisibleHeritageLayers: function() {
    // Move markers from overlays to markerCluster
    Object.keys(this.overlays).forEach(key => {
      const layer = this.overlays[key];
      const markers = this.markersByLayer[key];
      // Remove markers from overlay
      markers.forEach(marker => layer.removeLayer(marker));
      // Add markers to cluster
      markers.forEach(marker => this.markerCluster.addLayer(marker));
    });
    // Add markerCluster to map
    if (!this.map.hasLayer(this.markerCluster)) {
      this.map.addLayer(this.markerCluster);
    }
    this.clusteringEnabled = true;
    this.updateClusteringControlIcon();
  },

  /**
   * Disable clustering for visible heritage layers
   */
  disableClusteringForVisibleHeritageLayers: function() {
    // Move markers from markerCluster back to overlays
    Object.keys(this.overlays).forEach(key => {
      const layer = this.overlays[key];
      const markers = this.markersByLayer[key];
      // Remove markers from cluster
      markers.forEach(marker => this.markerCluster.removeLayer(marker));
      // Add markers back to overlay
      markers.forEach(marker => layer.addLayer(marker));
    });
    // Remove markerCluster from map
    if (this.map.hasLayer(this.markerCluster)) {
      this.map.removeLayer(this.markerCluster);
    }
    this.clusteringEnabled = false;
    this.updateClusteringControlIcon();
  },

  /**
   * Toggle clustering control
   */
  toggleClusteringControl: function(container) {
    if (this.clusteringEnabled) {
      this.disableClusteringForVisibleHeritageLayers();
    } else {
      this.enableClusteringForVisibleHeritageLayers();
    }
  },

  /**
   * Update clustering control icon
   */
  updateClusteringControlIcon: function() {
    const control = document.querySelector('.icon-toggle-switch .toggle-icon');
    if (!control) return;
    if (this.clusteringEnabled) {
      control.classList.remove('toggle-scatter');
      control.classList.add('toggle-cluster');
      control.textContent = 'graph_6';
    } else {
      control.classList.remove('toggle-cluster');
      control.classList.add('toggle-scatter');
      control.textContent = 'grain';
    }
  },
  
  /**
   * Setup the grouped layer control
   */
  setupLayerControl: function() {
    // Grouped overlays structure with colored dots
    const groupedOverlays = {
      "Heritage Layers": {
        '<span class="layer-label-inscriptions">Inscriptions</span>': this.overlays.inscriptions,
        '<span class="layer-label-herostones">Herostones</span>': this.overlays.herostones,
        '<span class="layer-label-temples">Ancient Temples</span>': this.overlays.temples
      }
    };
    
    // Add grouped layer control (empty baseLayers object since OSM is the only default)
    this.layerControl = L.control.groupedLayers({}, groupedOverlays, {
      groupCheckboxes: true,
      collapsed: true
    }).addTo(this.map);
    
    // Listen to layer add/remove events to update clustering
    this.map.on('overlayadd', (e) => {
      // Find which layer was added
      const layerKey = this.getLayerKey(e.layer);
      if (layerKey && this.clusteringEnabled) {
        // Add markers back to cluster
        const markers = this.markersByLayer[layerKey];
        markers.forEach(marker => {
          if (!this.markerCluster.hasLayer(marker)) {
            this.markerCluster.addLayer(marker);
          }
        });
      }
    });
    
    this.map.on('overlayremove', (e) => {
      // Find which layer was removed
      const layerKey = this.getLayerKey(e.layer);
      if (layerKey && this.clusteringEnabled) {
        // Remove markers from cluster
        const markers = this.markersByLayer[layerKey];
        markers.forEach(marker => {
          if (this.markerCluster.hasLayer(marker)) {
            this.markerCluster.removeLayer(marker);
          }
        });
      }
    });
  },
  
  /**
   * Get the layer key for a given layer
   */
  getLayerKey: function(layer) {
    if (layer === this.overlays.inscriptions) return 'inscriptions';
    if (layer === this.overlays.herostones) return 'herostones';
    if (layer === this.overlays.temples) return 'temples';
    return null;
  },
  
  /**
   * Initialize UI event handlers
   */
  initUI: function() {
    // Cache DOM elements once
    const menuBtn = document.getElementById('menu-btn');
    const sidebar = document.getElementById('sidebar');
    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-input');
    const advSearchForm = document.getElementById('advanced-search-form');
    const basemapOsmBtn = document.getElementById('basemap-osm');
    const basemapCartoBtn = document.getElementById('basemap-carto');
    const layerCheckboxes = {
      inscriptions: document.getElementById('layer-inscriptions'),
      herostones: document.getElementById('layer-herostones'),
      temples: document.getElementById('layer-temples')
    };

    // Sidebar toggle
    const closeSidebarBtn = document.getElementById('close-sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    if (menuBtn && sidebar) {
      menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        if (sidebarOverlay) {
          sidebarOverlay.classList.toggle('active');
        }
      });
    }
    
    if (closeSidebarBtn && sidebar) {
      closeSidebarBtn.addEventListener('click', () => {
        sidebar.classList.remove('open');
        if (sidebarOverlay) {
          sidebarOverlay.classList.remove('active');
        }
      });
    }
    
    // Close sidebar when clicking overlay
    if (sidebarOverlay && sidebar) {
      sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
      });
    }
    // Search box toggle
    if (searchBtn && searchInput) {
      searchBtn.addEventListener('click', () => {
        const isMobile = window.innerWidth <= 600;
        if (isMobile) {
          // Move search input to mobile-search-bar below navbar
          const mobileSearchBar = document.getElementById('mobile-search-bar');
          if (mobileSearchBar) {
            mobileSearchBar.innerHTML = '';
            searchInput.style.display = 'inline-block';
            searchInput.style.width = '95%';
            mobileSearchBar.appendChild(searchInput);
            mobileSearchBar.style.display = 'block';
            searchInput.focus();
            document.body.classList.add('mobile-search-open');
          }
        } else {
          // Desktop: show/hide in navbar
          if (searchInput.style.display === 'none') {
            searchInput.style.display = 'inline-block';
            searchInput.focus();
          } else {
            searchInput.style.display = 'none';
          }
        }
      });
      // Hide mobile search bar when input loses focus
      searchInput.addEventListener('blur', () => {
        const isMobile = window.innerWidth <= 600;
        if (isMobile) {
          const mobileSearchBar = document.getElementById('mobile-search-bar');
          if (mobileSearchBar) {
            // Delay to allow click events to fire
            setTimeout(() => {
              mobileSearchBar.style.display = 'none';
              searchInput.style.display = 'none';
              // Move back to navbar-search for next time
              document.querySelector('.navbar-search').appendChild(searchInput);
              document.body.classList.remove('mobile-search-open');
            }, 200);
          }
        }
      });
      
      // Handle search input (Enter key)
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.performSearch(searchInput.value.trim());
        }
      });
      
      // Handle search input (real-time search on input)
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        if (query.length >= 2) {
          this.performSearch(query);
        } else if (query.length === 0) {
          // Clear highlights when search is cleared
          this.clearSearchHighlights();
        }
      });
    }
    // Advanced search form
    if (advSearchForm) {
      advSearchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.performAdvancedSearch(new FormData(advSearchForm));
      });
    }
    // Basemap toggle - removed (OSM is the only default basemap)
    
    // Layer selection checkboxes
    Object.entries(layerCheckboxes).forEach(([key, checkbox]) => {
      if (checkbox) {
        checkbox.checked = true;
        checkbox.addEventListener('change', () => {
          const markers = this.markersByLayer[key];
          
          // Add/remove overlays based on checkbox state
          if (checkbox.checked) {
            if (!this.map.hasLayer(this.overlays[key])) {
              this.map.addLayer(this.overlays[key]);
            }
            // If clustering is enabled, add markers back to cluster
            if (this.clusteringEnabled) {
              markers.forEach(marker => {
                if (!this.markerCluster.hasLayer(marker)) {
                  this.markerCluster.addLayer(marker);
                }
              });
            }
          } else {
            if (this.map.hasLayer(this.overlays[key])) {
              this.map.removeLayer(this.overlays[key]);
            }
            // If clustering is enabled, remove markers from cluster
            if (this.clusteringEnabled) {
              markers.forEach(marker => {
                if (this.markerCluster.hasLayer(marker)) {
                  this.markerCluster.removeLayer(marker);
                }
              });
            }
          }
        });
      }
    });
    // Attribution popup logic
    const infoBtn = document.getElementById('info-btn');
    const attributionPopup = document.getElementById('attribution-popup');
    const closeAttribution = document.getElementById('close-attribution');
    const attributionContent = document.getElementById('attribution-content');
    if (infoBtn && attributionPopup && closeAttribution && attributionContent) {
      infoBtn.addEventListener('click', () => {
        // Always show all three attributions: OSM, Carto, Leaflet
  let html = '';
  // Data attribution
  html += `<div style=\"margin-bottom:0.5em\"><strong>Data</strong>: <a href=\"https://mythicsociety.org/\" target=\"_blank\">The Mythic Society</a><br>Bengaluru Inscriptions 3D Digital Conservation Project.</div>`;
  // OSM
  let tempDiv = document.createElement('div');
  tempDiv.className = 'leaflet-control-attribution leaflet-control';
  tempDiv.innerHTML = HeritageApp.baseLayers["OSM"].getAttribution();
  html += `<div style=\"margin-bottom:0.5em\"><strong>OSM</strong>: ${tempDiv.innerHTML}</div>`;
  // Leaflet
  tempDiv.innerHTML = 'Map library: <a href=\"https://leafletjs.com/\" target=\"_blank\">Leaflet</a>';
  html += `<div style=\"margin-bottom:0.5em\"><strong>Leaflet</strong>: ${tempDiv.innerHTML}</div>`;
  attributionContent.innerHTML = html;
  attributionPopup.style.display = 'block';
      });
      closeAttribution.addEventListener('click', () => {
        attributionPopup.style.display = 'none';
      });
      // Optional: close popup when clicking outside
      document.addEventListener('mousedown', (e) => {
        if (attributionPopup.style.display === 'block' && !attributionPopup.contains(e.target) && e.target !== infoBtn) {
          attributionPopup.style.display = 'none';
        }
      });
    }
  },
  
  /**
   * Load data for all layers
   */
  loadData: function() {
    this.fetchCSV(this.config.urls.inscriptions, data => 
      this.processCSVData(data, this.overlays.inscriptions));
    this.fetchCSV(this.config.urls.herostones, data => 
      this.processCSVData(data, this.overlays.herostones));
    this.fetchCSV(this.config.urls.temples, data => 
      this.processCSVData(data, this.overlays.temples));
  },
  
  /**
   * Fetch CSV data from URL
   * @param {string} url - CSV data URL
   * @param {function} callback - Function to call with parsed data
   */
  fetchCSV: function(url, callback) {
    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`Network response error: ${response.status}`);
        return response.text();
      })
      .then(text => {
        // Efficient CSV parsing: split only once, trim, skip empty lines
        const rows = text.split('\n').map(row => row.trim()).filter(row => row.length > 0).map(row => row.split(','));
        callback(rows);
      })
      .catch(error => {
        console.error('Error fetching CSV:', error);
      });
  },
  
  /**
   * Process CSV data and add markers to layer
   * @param {Array} rows - CSV data rows
   * @param {L.LayerGroup} layerGroup - Layer group to add markers to
   */
  processCSVData: function(rows, layerGroup) {
    if (!rows || rows.length < 2) {
      console.warn('CSV data is empty or invalid');
      return;
    }
    // Parse header row to find column indices
    const header = rows[0].map(h => h.trim().toLowerCase());
    // Accept both 'lat'/'lng' and 'latitude'/'longitude' column names
    const indices = {
      lat: header.findIndex(h => h === 'lat' || h === 'latitude'),
      lng: header.findIndex(h => h === 'lng' || h === 'longitude'),
      name: header.findIndex(h => h === 'village' || h === 'temple'),
      desc: header.findIndex(h => h.includes('desc')),
      // Herostone-specific fields
      heroName: header.findIndex(h => h.includes('name of the hero')),
      typeOfHerostone: header.findIndex(h => h.includes('type of herostone')),
      period: header.findIndex(h => h === 'period'),
      script: header.findIndex(h => h.includes('script')),
      conservationStatus: header.findIndex(h => h.includes('conservation status')),
      withInscription: header.findIndex(h => h.includes('with inscription')),
      // Temple-specific fields
      temple: header.findIndex(h => h === 'temple'),
      village: header.findIndex(h => h === 'village'),
      century: header.findIndex(h => h === 'century'),
      mainDeity: header.findIndex(h => h.includes('main deity')),
      architecturalStyle: header.findIndex(h => h.includes('temple architectural style')),
      templeStatus: header.findIndex(h => h.includes('temple current status')),
      // Inscription-specific fields
      currentStatus: header.findIndex(h => h.includes('current status')),
      inscriptionLanguage: header.findIndex(h => h.includes('inscription language')),
      fromPeriod: header.findIndex(h => h.includes('from period') && h.includes('century'))
    };
    if (indices.lat === -1 || indices.lng === -1) {
      console.error('CSV data missing required latitude/longitude columns');
      return;
    }
    // Create markers for each data row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length <= 1) continue; // Skip empty rows
      if (row[indices.lat] && row[indices.lng]) {
        const lat = parseFloat(row[indices.lat]);
        const lng = parseFloat(row[indices.lng]);
        if (isNaN(lat) || isNaN(lng)) continue;
        let name = indices.name !== -1 ? row[indices.name] : '';
        const desc = indices.desc !== -1 ? row[indices.desc] : '';
        
        // Collect additional fields based on layer type
        const additionalData = {};
        
        if (layerGroup === this.overlays.inscriptions) {
          additionalData.currentStatus = indices.currentStatus !== -1 ? row[indices.currentStatus] : '';
          additionalData.inscriptionLanguage = indices.inscriptionLanguage !== -1 ? row[indices.inscriptionLanguage] : '';
          additionalData.fromPeriod = indices.fromPeriod !== -1 ? row[indices.fromPeriod] : '';
        } else if (layerGroup === this.overlays.herostones) {
          additionalData.heroName = indices.heroName !== -1 ? row[indices.heroName] : '';
          additionalData.typeOfHerostone = indices.typeOfHerostone !== -1 ? row[indices.typeOfHerostone] : '';
          additionalData.period = indices.period !== -1 ? row[indices.period] : '';
          additionalData.script = indices.script !== -1 ? row[indices.script] : '';
          additionalData.conservationStatus = indices.conservationStatus !== -1 ? row[indices.conservationStatus] : '';
          additionalData.withInscription = indices.withInscription !== -1 ? row[indices.withInscription] : '';
        } else if (layerGroup === this.overlays.temples) {
          // For temples, use 'Temple' column as name
          name = indices.temple !== -1 ? row[indices.temple] : name;
          additionalData.village = indices.village !== -1 ? row[indices.village] : '';
          additionalData.century = indices.century !== -1 ? row[indices.century] : '';
          additionalData.mainDeity = indices.mainDeity !== -1 ? row[indices.mainDeity] : '';
          additionalData.architecturalStyle = indices.architecturalStyle !== -1 ? row[indices.architecturalStyle] : '';
          additionalData.templeStatus = indices.templeStatus !== -1 ? row[indices.templeStatus] : '';
        }
        
        this.addMarker(lat, lng, name, desc, layerGroup, additionalData);
      }
    }
  },
  
  /**
   * Add a marker to the specified layer
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {string} name - Marker name
   * @param {string} description - Marker description
   * @param {L.LayerGroup} layerGroup - Layer group to add marker to
   * @param {Object} additionalData - Additional data for specific marker types
   */
  addMarker: function(lat, lng, name, description, layerGroup, additionalData = {}) {
    // Refactored: use mapping for color class
    const layerColorClassMap = {
      inscriptions: 'custom-dot-marker marker-inscriptions',
      herostones: 'custom-dot-marker marker-herostones',
      temples: 'custom-dot-marker marker-temples'
    };
    let colorClass = 'custom-dot-marker';
    let layerKey = null;
    if (layerGroup === HeritageApp.overlays.inscriptions) {
      colorClass = layerColorClassMap.inscriptions;
      layerKey = 'inscriptions';
    } else if (layerGroup === HeritageApp.overlays.herostones) {
      colorClass = layerColorClassMap.herostones;
      layerKey = 'herostones';
    } else if (layerGroup === HeritageApp.overlays.temples) {
      colorClass = layerColorClassMap.temples;
      layerKey = 'temples';
    }
    const marker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: colorClass,
        iconSize: [8, 8],
        iconAnchor: [4, 4],
        popupAnchor: [0, -4]
      })
    });
    
    // Create popup content based on layer type
    const popupContent = this.createPopupContent(name, description, layerKey, additionalData);
    marker.bindPopup(popupContent);
    
    // Store marker data for searching
    const markerData = {
      marker: marker,
      name: name || '',
      description: description || '',
      lat: lat,
      lng: lng,
      layerKey: layerKey,
      layerGroup: layerGroup,
      additionalData: additionalData
    };
    this.allMarkersData.push(markerData);
    
    // Store marker for later clustering/unclustering
    if (layerKey) {
      this.markersByLayer[layerKey].push(marker);
    }
    
    // Add to cluster or overlay based on current clustering state
    if (this.clusteringEnabled) {
      this.markerCluster.addLayer(marker);
      // Ensure markerCluster is on map
      if (!this.map.hasLayer(this.markerCluster)) {
        this.map.addLayer(this.markerCluster);
      }
    } else {
      layerGroup.addLayer(marker);
    }
  },
  
  /**
   * Create popup content for a marker
   * @param {string} name - Marker name
   * @param {string} description - Marker description
   * @param {string} layerKey - Layer key (inscriptions, herostones, temples)
   * @param {Object} additionalData - Additional data fields
   * @returns {string} HTML popup content
   */
  createPopupContent: function(name, description, layerKey, additionalData = {}) {
    let content = `<b>${name || 'Unknown'}</b>`;
    
    // Add layer-specific fields
    if (layerKey === 'inscriptions' && additionalData) {
      const fields = [
        { key: 'currentStatus', label: 'Current Status' },
        { key: 'inscriptionLanguage', label: 'Inscription Language' },
        { key: 'fromPeriod', label: 'Period' }
      ];
      
      fields.forEach(field => {
        if (additionalData[field.key]) {
          content += `<br><strong>${field.label}:</strong> ${additionalData[field.key]}`;
        }
      });
    } else if (layerKey === 'herostones' && additionalData) {
      const fields = [
        { key: 'typeOfHerostone', label: 'Type' },
        { key: 'period', label: 'Period' },
        { key: 'script', label: 'Script' },
        { key: 'conservationStatus', label: 'Conservation Status' },
        { key: 'withInscription', label: 'With Inscription' }
      ];
      
      fields.forEach(field => {
        if (additionalData[field.key]) {
          content += `<br><strong>${field.label}:</strong> ${additionalData[field.key]}`;
        }
      });
    } else if (layerKey === 'temples' && additionalData) {
      const fields = [
        { key: 'village', label: 'Village' },
        { key: 'century', label: 'Century' },
        { key: 'mainDeity', label: 'Main Deity' },
        { key: 'architecturalStyle', label: 'Style' },
        { key: 'templeStatus', label: 'Temple Current Status' }
      ];
      
      fields.forEach(field => {
        if (additionalData[field.key]) {
          content += `<br><strong>${field.label}:</strong> ${additionalData[field.key]}`;
        }
      });
    }
    
    return content;
  },
  
  // Removed getDefaultIcon, not needed for dot markers
  
  /**
   * Perform search through marker data
   * @param {string} query - Search query string
   */
  performSearch: function(query) {
    if (!query || query.length < 2) {
      this.clearSearchHighlights();
      return;
    }
    
    // Clear previous highlights
    this.clearSearchHighlights();
    
    // Check if query is coordinates (lat, lng or lat lng)
    const coordMatch = this.parseCoordinates(query);
    if (coordMatch) {
      console.log('Detected coordinates:', coordMatch);
      this.highlightCoordinates(coordMatch.lat, coordMatch.lng, 'Coordinates');
      return;
    }
    
    // Search through all markers (case-insensitive)
    const queryLower = query.toLowerCase();
    const matches = this.allMarkersData.filter(data => {
      return data.name.toLowerCase().includes(queryLower) ||
             data.description.toLowerCase().includes(queryLower);
    });
    
    if (matches.length > 0) {
      console.log(`Found ${matches.length} match(es) in heritage sites for:`, query);
      this.highlightAndZoomToMatches(matches);
      return;
    }
    
    // If no local matches, try OSM Nominatim geocoding
    console.log('No local matches, trying OSM Nominatim geocoding...');
    this.geocodeWithNominatim(query);
  },
  
  /**
   * Geocode address/place using OSM Nominatim
   * @param {string} query - Address or place name
   */
  geocodeWithNominatim: function(query) {
    // OSM Nominatim API endpoint
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
    
    fetch(url, {
      headers: {
        'User-Agent': 'HeritageWebGIS/1.0' // Nominatim requires a user agent
      }
    })
    .then(response => response.json())
    .then(results => {
      if (results && results.length > 0) {
        console.log(`Found ${results.length} geocoding result(s)`);
        
        // Use the first result (most relevant)
        const result = results[0];
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        const displayName = result.display_name;
        
        // Highlight the location
        this.highlightCoordinates(lat, lng, displayName);
      } else {
        console.log('No geocoding results found for:', query);
        alert('No results found for: ' + query);
      }
    })
    .catch(error => {
      console.error('Geocoding error:', error);
      alert('Error searching for location. Please try again.');
    });
  },
  
  /**
   * Parse coordinates from search query
   * @param {string} query - Search query
   * @returns {Object|null} - {lat, lng} or null
   */
  parseCoordinates: function(query) {
    // Try different coordinate formats:
    // 12.9155882, 77.7659345
    // 12.9155882 77.7659345
    // 12.9155882,77.7659345
    
    // Remove extra spaces and normalize
    const normalized = query.trim().replace(/\s+/g, ' ');
    
    // Try comma-separated or space-separated
    const parts = normalized.split(/[,\s]+/);
    
    if (parts.length === 2) {
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      
      // Validate lat/lng ranges
      if (!isNaN(lat) && !isNaN(lng) && 
          lat >= -90 && lat <= 90 && 
          lng >= -180 && lng <= 180) {
        return { lat: lat, lng: lng };
      }
    }
    
    return null;
  },
  
  /**
   * Highlight coordinates on map
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {string} displayName - Optional display name for the location
   */
  highlightCoordinates: function(lat, lng, displayName) {
    // Create highlighted marker with Bootstrap icon
    const highlightMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        html: '<i class="bi bi-geo-alt-fill" style="font-size: 2em; color: #8B0000;"></i>',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
        className: 'search-highlight-icon'
      }),
      zIndexOffset: 1000
    });
    
    // Add popup with location info
    let popupContent = '';
    if (displayName && displayName !== 'Coordinates') {
      popupContent = `
        <b>Found Location</b><br>
        ${displayName}<br>
        <small>Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}</small>
      `;
    } else {
      popupContent = `
        <b>Searched Location</b><br>
        Latitude: ${lat.toFixed(7)}<br>
        Longitude: ${lng.toFixed(7)}
      `;
    }
    highlightMarker.bindPopup(popupContent);
    
    // Add to map
    highlightMarker.addTo(this.map);
    this.highlightedMarkers.push(highlightMarker);
    
    // Zoom to coordinates
    this.map.setView([lat, lng], 16, {
      animate: true,
      duration: 1
    });
    
    // Open popup after zoom
    setTimeout(() => {
      highlightMarker.openPopup();
    }, 500);
  },
  
  /**
   * Highlight matched markers and zoom to them
   * @param {Array} matches - Array of matched marker data
   */
  highlightAndZoomToMatches: function(matches) {
    const bounds = L.latLngBounds();
    
    matches.forEach(data => {
      const marker = data.marker;
      const layerGroup = data.layerGroup;
      
      // Ensure the layer is visible
      if (!this.map.hasLayer(layerGroup)) {
        this.map.addLayer(layerGroup);
      }
      
      // Create highlighted marker with Bootstrap icon
      const highlightMarker = L.marker([data.lat, data.lng], {
        icon: L.divIcon({
          html: '<i class="bi bi-geo-alt-fill" style="font-size: 2em; color: #8B0000;"></i>',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          popupAnchor: [0, -32],
          className: 'search-highlight-icon'
        }),
        zIndexOffset: 1000
      });
      
      // Copy popup from original marker
      highlightMarker.bindPopup(marker.getPopup().getContent());
      
      // Add highlight to map
      highlightMarker.addTo(this.map);
      this.highlightedMarkers.push(highlightMarker);
      
      // Add to bounds
      bounds.extend([data.lat, data.lng]);
    });
    
    // Zoom to show all matches
    if (bounds.isValid()) {
      this.map.fitBounds(bounds, {
        padding: [50, 50],
        maxZoom: 16
      });
    }
    
    // Open popup for first match if only one result
    if (matches.length === 1) {
      setTimeout(() => {
        this.highlightedMarkers[0].openPopup();
      }, 500);
    }
  },
  
  /**
   * Clear search highlights
   */
  clearSearchHighlights: function() {
    this.highlightedMarkers.forEach(marker => {
      this.map.removeLayer(marker);
    });
    this.highlightedMarkers = [];
  },
  
  /**
   * Perform advanced search
   * @param {FormData} formData - Form data from advanced search form
   */
  performAdvancedSearch: function(formData) {
    // TODO: Implement advanced search functionality
    const searchParams = {
      siteName: formData.get('siteName'),
      type: formData.get('type'),
      year: formData.get('year'),
      location: formData.get('location'),
      logic: formData.get('logic') || 'AND'
    };
    
    console.log('Advanced search with params:', searchParams);
    alert('Advanced search submitted (logic not implemented yet)');
  }
};

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  HeritageApp.init();
});
