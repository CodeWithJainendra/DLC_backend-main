// MapCard.js
class MapCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.render();
    }

    static get observedAttributes() {
        return ['loading'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'loading') {
            this.updateLoadingState(newValue === 'true');
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    position: relative;
                }

                .map-container {
                    position: relative;
                    min-height: 400px;
                    background: #fff;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    overflow: hidden;
                }

                .loading-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(255, 255, 255, 0.9);
                    display: none;
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                }

                .loading-overlay.active {
                    display: flex;
                }

                .spinner {
                    width: 50px;
                    height: 50px;
                    border: 5px solid #f3f3f3;
                    border-radius: 50%;
                    border-top: 5px solid #3498db;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                .content {
                    padding: 16px;
                }

                h2 {
                    margin: 0 0 16px 0;
                    color: #333;
                }
            </style>

            <div class="map-container">
                <div class="loading-overlay">
                    <div class="spinner"></div>
                </div>
                <div class="content">
                    <h2>State-wise Pensioner Distribution</h2>
                    <slot></slot>
                </div>
            </div>
        `;
    }

    updateLoadingState(isLoading) {
        const overlay = this.shadowRoot.querySelector('.loading-overlay');
        if (isLoading) {
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }
    }
}

customElements.define('map-card', MapCard);