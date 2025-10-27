// mapHandler.js
class StateMapHandler {
    constructor() {
        this.mapCard = document.querySelector('map-card');
        this.mapContainer = document.getElementById('map-container');
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            this.fetchStateData();
        });
    }

    async fetchStateData() {
        try {
            // Show loading state
            this.mapCard.setAttribute('loading', 'true');

            const response = await fetch('/dlc-pension-data-api/geography/states');
            if (!response.ok) {
                throw new Error('Failed to fetch state data');
            }

            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to load state data');
            }

            // Process and display the data
            this.updateMapDisplay(data);

        } catch (error) {
            console.error('Error fetching state data:', error);
            // Handle error display
            this.showError(error.message);
        } finally {
            // Hide loading state
            this.mapCard.setAttribute('loading', 'false');
        }
    }

    updateMapDisplay(data) {
        // Implement your map visualization logic here
        // This will depend on what mapping library you're using (e.g., Leaflet, Google Maps, etc.)
        if (this.mapContainer) {
            // Update your map visualization with data.data
            // Example: updateChoropleth(data.data);
        }

        // Update summary statistics if needed
        this.updateSummaryStats(data.summary);
    }

    updateSummaryStats(summary) {
        const statsContainer = document.getElementById('map-stats');
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-item">
                        <h3>Total States</h3>
                        <p>${summary.total_states}</p>
                    </div>
                    <div class="stat-item">
                        <h3>Total Pensioners</h3>
                        <p>${summary.total_pensioners.toLocaleString()}</p>
                    </div>
                    <div class="stat-item">
                        <h3>Verified Pensioners</h3>
                        <p>${summary.total_verified.toLocaleString()}</p>
                    </div>
                    <div class="stat-item">
                        <h3>Verification Rate</h3>
                        <p>${summary.overall_verification_rate.toFixed(1)}%</p>
                    </div>
                </div>
            `;
        }
    }

    showError(message) {
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-message';
        errorContainer.textContent = message;
        this.mapContainer.appendChild(errorContainer);
    }
}

// Initialize the handler
const stateMapHandler = new StateMapHandler();