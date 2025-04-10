// Global state variables
let currentFilters = {
    country: '',
    year: '',
    product: ''
};

// DOM Elements
const domElements = {
    entitySelect: document.getElementById('entitySelect'),
    yearSelect: document.getElementById('yearSelect'),
    productSelect: document.getElementById('productSelect'),
    charts: {
        map: document.getElementById('mapChart'),
        trend: document.getElementById('trendChart'),
              scatter: document.getElementById('scatterChart'),
        stats: document.getElementById('statsChart'),
        decade: document.getElementById('decadeChart'),
        yearly: document.getElementById('yearlyChart')
    }
};

// Base URL for API requests
const BASE_URL = 'https://cmp419-unit2.onrender.com';

// Initialization
async function initializeDashboard() {
    try {
        await populateDropdowns();
        await initializeFixedCharts();
        addEventListeners();
        updateAllCharts();
    } catch (error) {
        console.error('Dashboard initialization failed:', error);
    }
}

// Utility: Fetch JSON data from a URL
async function fetchData(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} for ${url}`);
    }
    return response.json();
}

// Populate dropdowns; product values are kept as original strings.
async function populateDropdowns() {
    try {
        const [countries, years, products] = await Promise.all([
            fetchData(`${BASE_URL}/api/countries`),
            fetchData(`${BASE_URL}/api/years`),
            fetchData(`${BASE_URL}/api/products`)
        ]);

        populateSelect(domElements.entitySelect, countries, 'Select Country');
        populateSelect(domElements.yearSelect, years.sort((a, b) => b - a), 'Select Year');
        populateSelect(domElements.productSelect, products, 'Select Product');
    } catch (error) {
        console.error('Error populating dropdowns:', error);
    }
}

function populateSelect(selectElement, options, placeholder) {
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    options.forEach(option => {
        const opt = document.createElement('option');
        const optionStr = String(option);
        opt.value = optionStr;
        opt.textContent = optionStr.includes('_') ? formatProductName(optionStr) : optionStr;
        selectElement.appendChild(opt);
    });
}

// Event Handling
function addEventListeners() {
    [domElements.entitySelect, domElements.yearSelect, domElements.productSelect].forEach(select => {
        select.addEventListener('change', handleFilterChange);
    });
}

function handleFilterChange() {
    currentFilters = {
        country: domElements.entitySelect.value,
        year: domElements.yearSelect.value,
        product: domElements.productSelect.value
    };
    updateAllCharts();
}

// Update all dynamic charts based on selected filters
function updateAllCharts() {
    if (currentFilters.year) {
        updateMapChart();

        updateDecadeChart();
        updateYearlyChart();
    }
    if (currentFilters.country && currentFilters.product) {
        updateTrendChart();
        updateBarChart();
        updateStatsChart();
        loadBubbleChart();
        updateScatterChart()
        loadComparison(currentFilters.country, currentFilters.year, currentFilters.product);
    }
     loadTopProducers();

}
// Add event listener to product dropdown
document.getElementById('productSelect').addEventListener('change', loadTopProducers);

// Call this function on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeDashboard();
    setTimeout(loadTopProducers, 1000);
});

// Formatting utility: Convert DB column name to user-friendly text
function formatProductName(product) {
    return product
        .replace(/_/g, ' ')
        .replace(/Production/i, 'Production')
        .trim();
}

// Update bar chart from
async function updateBarChart() {
  const entity = document.getElementById("entitySelect").value;
  const product = document.getElementById("productSelect").value;

  if (!entity || !product) {
    Plotly.purge("barChart");
    return;
  }

  fetch(`${BASE_URL}/api/trend/${entity}/${product}`)
    .then(res => res.json())
    .then(data => {
      const trace = {
        x: data.map(d => d.Year),
        y: data.map(d => d.production),
        type: "bar",
        marker: { color: "#51b7e0" }
      };
      const layout = {
        title: `${formatProductName(product)} Production in ${entity}`,
        xaxis: { title: "Year" },
        yaxis: { title: "Production (tonnes)" }
      };
      Plotly.react("barChart", [trace], layout);
    })
    .catch(error => {
      console.error("Bar chart data fetch failed:", error);
    });
}

// Update trend chart: historical data for selected country/product
async function updateTrendChart() {
    if (!currentFilters.country || !currentFilters.product) return;
    try {
        const data = await fetchData(`${BASE_URL}/api/trend/${currentFilters.country}/${currentFilters.product}`);

        // Prepare data for the treemap
        const labels = data.map(d => d.Year);
        const values = data.map(d => d.production);
        const parents = data.map(() => currentFilters.product);

        const trace = {
            type: 'treemap',
            labels: labels,
            parents: parents,
            values: values,
            textinfo: 'label+value',
            marker: {
                colors: values,
                colorscale: 'Viridis',
                showscale: true
            }
        };

        Plotly.react('trendChart', [trace], {
            title: `${currentFilters.country} Production Trend for ${formatProductName(currentFilters.product)}`,
            margin: { t: 50, l: 0, r: 0, b: 0 },
            height: 600
        });
    } catch (error) {
        console.error('Trend chart error:', error);
    }
}

// Update map chart: global distribution for selected product/year
async function updateMapChart() {
    if (!currentFilters.year || !currentFilters.product) return;

    try {
        const data = await fetchData(
            `${BASE_URL}/api/map/${currentFilters.year}/${currentFilters.product}`
        );
        // Get selected country index for highlighting
        const selectedCountryIndex = data.findIndex(d => d.Entity === currentFilters.country);
        const maxValue = Math.max(...data.map(d => d.value));

        // Main Choropleth Map
        Plotly.react(domElements.charts.map, [{
            type: 'choropleth',
            locations: data.map(d => d.Entity),
            z: data.map(d => d.value),
            locationmode: 'country names',
            colorscale: 'red',
            hoverinfo: 'location+z+text',
            text: data.map(d =>
                `${d.Entity}<br>${d.value?.toLocaleString() || 'N/A'} tonnes`
            ),
            selectedpoints: selectedCountryIndex !== -1 ? [selectedCountryIndex] : [],
            selected: {
                marker: {
                    opacity: 1,
                    color: '#EE4B2B',
                    size: 20
                }
            },
            unselected: {
                marker: { opacity: 0.5 }
            },
            marker: {
                line: {
                    color: 'white',
                    width: 1
                }
            },
            colorbar: {
                title: {
                    text: 'Production (tonnes)',
                    font: {
                        size: 14,
                        family: 'Arial'
                    }
                },
                tickformat: ',d',
                thickness: 20,
                len: 0.75,
                x: 1.02
            }
        }], {
            title: `Global ${formatProductName(currentFilters.product)} Production (${currentFilters.year})`,
            geo: {
                showframe: false,
                projection: { type: 'natural earth' },
                bgcolor: '#f8f9fa',
                showland: true,
                landcolor: 'rgb(217, 217, 217)'
            },
            margin: { t: 40, b: 0, l: 0, r: 0 }
        });

// Bubble Map Visualization
  const scatterData = [{
      type: 'scattergeo',
      locationmode: 'country names',
      locations: data.map(d => d.Entity),
      text: data.map(d =>
          `${d.Entity}<br>${d.value?.toLocaleString() || 'N/A'} tonnes`
      ),
      marker: {
          size: data.map(d => 10 + (d.value / maxValue * 50)),
          color: data.map(d => d.value),
          colorscale: 'Viridis',
          cmin: 0,
          cmax: maxValue,
          line: {
              color: 'rgba(0,0,0,0.2)',
              width: 1
          },
          sizemode: 'diameter',
          opacity: 0.8,
          colorbar: {
              title: {
                  text: 'Production (tonnes)',
                  font: {
                      size: 14,
                      family: 'Arial'
                  }
              },
              tickformat: ',d',
              thickness: 20,
              len: 0.75,
              x: 1.05
          }
      },
      hoverinfo: 'text+name',
      name: 'Production'
  }];

// Add highlighted selected country
  if (selectedCountryIndex !== -1) {
            const selectedCountry = data[selectedCountryIndex];
            scatterData.push({
                type: 'scattergeo',
                locationmode: 'country names',
                locations: [selectedCountry.Entity],
                text: [`${selectedCountry.Entity}<br>${selectedCountry.value?.toLocaleString() || 'N/A'} tonnes`],
                marker: {
                    size: 25 + (selectedCountry.value / maxValue * 50),
                    color: '#EE4B2B',
                    line: {
                        color: '#000',
                        width: 2
                    },
                    sizemode: 'diameter',
                    opacity: 1
                },
                name: 'Selected Country',
                hoverinfo: 'text+name',
                showlegend: false
            });
        }

        Plotly.react('symbolMap', scatterData, {
            title: `Production Intensity (${currentFilters.year})`,
            geo: {
                showframe: false,
                projection: { type: 'mercator' },
                bgcolor: '#f8f9fa',
                showland: true,
                landcolor: 'rgb(217, 217, 217)'
            },
            margin: { t: 40, b: 0 },
            coloraxis: {
                colorbar: {
                    title: 'Tonnes',
                    thickness: 20,
                    x: 1.1
                }
            }
        });

    } catch (error) {
        console.error('Map chart error:', error);
        // Clear both maps on error
        Plotly.purge(domElements.charts.map);
        Plotly.purge('symbolMap');
        domElements.charts.map.innerHTML =
            '<div class="chart-error">Failed to load map data</div>';
    }
}


function formatProductName(product) {
    return product.replace(/_/g, ' ').replace(/Production/i, 'Production').trim();
}

function formatProductName(product) {
    return product.replace(/_/g, ' ').replace(/Production/i, 'Production').trim();
}
// ---------------------
// Fixed Charts Initialization (Summary Data)
// ---------------------
async function initializeFixedCharts() {
    try {
        const [decadeData, yearlyData, statsData] = await Promise.all([
            fetchData('${BASE_URL}/api/data/decade'),
            fetchData('${BASE_URL}/api/data/yearly'),
            fetchData('${BASE_URL}/api/stats')
        ]);
        renderDecadeChart(decadeData);
        renderYearlyChart(yearlyData);
        renderStatsChart(statsData);
    } catch (error) {
        console.error('Error initializing fixed charts:', error);
    }
}

function renderDecadeChart(data) {
    // Expect data with properties: decade, Maize, Rice, Wheat
    const products = ['Maize', 'Rice', 'Wheat'];
    const traces = products.map(product => ({
        x: data.map(d => d.decade),
        y: data.map(d => d[product]),
        name: product,
        type: 'bar',
        marker: { color: '#' + Math.floor(Math.random() * 16777215).toString(16) }
    }));
    Plotly.newPlot(domElements.charts.decade, traces, {
        title: 'Decadal Production Trends',
        barmode: 'group',
        xaxis: { title: 'Decade' },
        yaxis: { title: 'Tonnes' }
    });
}

function renderYearlyChart(data) {
    // Plot global Maize production trend; adjust as necessary.
    Plotly.newPlot(domElements.charts.yearly, [{
        x: data.map(d => d.Year || d.year),
        y: data.map(d => d.Maize),
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Maize Production',
        line: { color: '#FF9F1C' }
    }], {
        title: 'Global Maize Production Trend',
        xaxis: { title: 'Year' },
        yaxis: { title: 'Tonnes' }
    });
}

function renderStatsChart(data) {
    console.log('Stats Data:', data);
    const products = Object.keys(data);
    const traces = ['mean', 'std'].map(stat => {
        const yValues = products.map(p => parseFloat(data[p][stat]) || 0);
        return {
            x: products.map(formatProductName),
            y: yValues,
            name: stat.toUpperCase(),
            type: 'bar'
        };
    });
    Plotly.newPlot(domElements.charts.stats, traces, {
        title: 'Production Statistics',
        barmode: 'group',
        xaxis: { title: 'Product', tickangle: -45 },
        yaxis: { title: 'Value' }
    });
}

// Decade Chart
function updateDecadeChart() {
    const product = document.getElementById("productSelect").value;

    if (!product) {
        Plotly.purge("decadeChart");
        return;
    }

    // Construct the fetch URL with the product parameter
    fetch(`${BASE_URL}/api/data/decade?product=${product}`)
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
        })
        .then(data => {
            const trace = {
                x: data.map(d => d.decade),
                y: data.map(d => d.production),
                type: "bar",
                marker: { color: "#ffa500" }
            };
            const layout = {
                title: `Decadal Production of ${product}`,
                xaxis: { title: "Decade" },
                yaxis: { title: "Average Production" }
            };
            Plotly.react("decadeChart", [trace], layout);
        })
        .catch(error => {
            console.error("Decade chart data fetch failed:", error);
        });
}


// Yearly Chart
function updateYearlyChart() {
    const year = document.getElementById("yearSelect").value;

    if (!year) {
        Plotly.purge("yearlyChart");
        return;
    }

    fetch(`${BASE_URL}/api/data/yearly`)
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
        })
        .then(data => {
            const yearlyData = data.find(d => d.Year == year);
            if (!yearlyData) {
                console.error("No data found for the selected year.");
                return;
            }

            // Dynamically extract all keys except 'Year'
            const labels = Object.keys(yearlyData).filter(key => key !== "Year");
            const values = labels.map(label => yearlyData[label]);

            const trace = {
                x: labels,
                y: values,
                type: "bar",
                marker: { color: "#5cb85c" }
            };

            const layout = {
                title: `Production in ${year} by Product`,
                xaxis: { title: "Product" },
                yaxis: { title: "Production (tonnes)" }
            };

            Plotly.react("yearlyChart", [trace], layout);
        })
        .catch(error => {
            console.error("Yearly chart data fetch failed:", error);
        });
}

//ScatterPlot
async function updateScatterChart() {
    if (!currentFilters.country) {
        Plotly.purge('scatterChart');
        return;
    }

    try {
        const data = await fetchData(`${BASE_URL}/api/country-trends/${currentFilters.country}`);

        const years = data.map(d => d.Year);

        // Extract all production keys (excluding "Year")
        const productionKeys = Object.keys(data[0]).filter(key => key !== 'Year');

        const traces = productionKeys.map(key => {
            return {
                x: years,
                y: data.map(d => d[key]),
                mode: 'lines+markers',
                name: formatProductName(key.replace(' Production (tonnes)', '')),
                marker: {
                    size: 6,
                    opacity: 0.8
                },
                line: {
                    width: 2
                },
                hoverinfo: 'x+y+name'
            };
        });

        const layout = {
            title: `Production Trends for ${currentFilters.country}`,
            xaxis: {
                title: 'Year',
                tickmode: 'linear',
                dtick: 5
            },
            yaxis: {
                title: 'Production (tonnes)',
                gridcolor: '#e0e0e0'
            },
            plot_bgcolor: '#ffffff',
            legend: {
                orientation: 'h',
                x: 0,
                y: 1.1
            },
            hovermode: 'closest'
        };

        Plotly.react('scatterChart', traces, layout);
    } catch (error) {
        console.error('Multi-line trend chart error:', error);
        document.getElementById('scatterChart').innerHTML =
            `<div class="chart-error">Error loading multi-line data: ${error.message}</div>`;
    }
}

// Stats Chart
function updateStatsChart() {
    const product = document.getElementById("productSelect").value;
    if (!product) {
        Plotly.purge("statsChart");
        return;
    }

    fetch(`${BASE_URL}/api/data/stats?product=${encodeURIComponent(product)}`)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.json();
        })
        .then(data => {
            const trace = {
                type: "indicator",
                mode: "number+delta",
                value: data.mean,
                delta: {
                    reference: data.mean - data.std,
                    increasing: { color: "green" },
                    decreasing: { color: "red" }
                },
                title: {
                    text: `${formatProductName(product)} Stats<br>`
                        + `<small>Range: ${data.min.toLocaleString()} - ${data.max.toLocaleString()} tonnes</small>`
                },
                number: {
                    suffix: " tonnes",
                    valueformat: ".1f"
                },
                gauge: {
                    shape: "bullet",
                    axis: {
                        range: [data.lower_bound, data.upper_bound],
                        visible: false
                    },
                    steps: [
                        { range: [data.lower_bound, data.upper_bound], color: "lightgray" }
                    ]
                }
            };

            Plotly.react("statsChart", [trace], {
                margin: { t: 100, b: 0, l: 50, r: 50 },
                height: 200
            });
        })
        .catch(error => {
            console.error("Stats chart error:", error);
            Plotly.purge("statsChart");
            document.getElementById("statsChart").innerHTML =
                `<div class="chart-error">Failed to load statistics: ${error.message}</div>`;
        });
}

async function loadBubbleChart() {
    try {
        const data = await fetchData(`${BASE_URL}/api/data/bubble`);

        // Create size values for the bubbles
        const maxProduction = Math.max(...data.map(d => d.total_production));

        const trace = {
            type: 'scatter',
            mode: 'markers',
            text: data.map(d => {
                const topCropsText = d.top_crops
                    ? d.top_crops.map(crop => `${crop.name}: ${crop.value.toLocaleString()} tonnes`).join('<br>')
                    : 'No detailed data';

                // Add more information about the country
                return `
                    <strong>${d.country}</strong><br>
                    Total Production: ${d.total_production.toLocaleString()} tonnes<br>
                    Top Crops:<br>${topCropsText}<br>
                    Area Harvested: ${d.area_harvested ? d.area_harvested.toLocaleString() + ' hectares' : 'N/A'}<br>
                    Yield: ${d.yield ? d.yield.toFixed(2) + ' tonnes/hectare' : 'N/A'}
                `;
            }),
            // Random x and y coordinates for visualization only
            x: data.map((_, i) => Math.random() * 100),
            y: data.map((_, i) => Math.random() * 100),
            marker: {
                size: data.map(d => 10 + (d.total_production / maxProduction * 50)),
                color: data.map((_, i) => i * 10),
                colorscale: 'Viridis',
                showscale: false,
                opacity: 0.8,
                line: {
                    color: 'white',
                    width: 1
                }
            },
            hoverinfo: 'text'
        };

        Plotly.react('bubbleChart', [trace], {
            title: 'Total Crop Production by Country',
            showlegend: false,
            xaxis: {
                title: '',
                showgrid: false,
                zeroline: false,
                showticklabels: false
            },
            yaxis: {
                title: '',
                showgrid: false,
                zeroline: false,
                showticklabels: false
            },
            hovermode: 'closest'
        });
    } catch (error) {
        console.error('Bubble chart error:', error);
        document.getElementById('bubbleChart').innerHTML =
            '<div class="chart-error">Failed to load bubble chart data</div>';
    }
}

// Function to load top producers data
async function loadTopProducers() {
    try {
        const cropType = document.getElementById('productSelect').value || 'Maize_Production';
        const response = await fetch(`${BASE_URL}/api/top_producers?crop_type=${encodeURIComponent(cropType)}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const trace = {
            type: 'bar',
            x: data.map(item => item.production_value),
            y: data.map(item => item.region),
            orientation: 'h',
            marker: {
                color: 'rgba(55, 128, 191, 0.7)',
                line: {
                    color: 'rgba(55, 128, 191, 1.0)',
                    width: 1
                }
            }
        };

        const layout = {
            title: `Top Producers: ${formatProductName(cropType)}`,
            xaxis: {
                title: 'Production (tonnes)'
            },
            yaxis: {
                title: 'Region',
                automargin: true
            },
            margin: {
                l: 150,
                r: 10,
                t: 50,
                b: 50
            }
        };

        Plotly.newPlot('topProducersChart', [trace], layout);
    } catch (error) {
        console.error('Error loading top producers:', error);
        document.getElementById('topProducersChart').innerHTML =
            `<div class="chart-error">Failed to load top producers data: ${error.message}</div>`;
    }
}

async function loadComparison(country, year, product) {
    try {
        console.log('Loading comparison for:', country, year, product);

        if (!country || !year || !product) {
            console.warn('Missing parameters for comparison');
            return;
        }
        if (typeof Chart === 'undefined') {
            throw new Error('Chart.js library is not loaded');
        }
        const response = await fetch(`${BASE_URL}/api/data/compare/${country}/${year}/${product}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('Comparison data:', data);

        if (data.error) {
            throw new Error(data.error);
        }

        const ctx = document.getElementById('radarChart');
        if (!ctx) {
            throw new Error('Radar chart canvas element not found');
        }
        if (window.comparisonChart) {
            window.comparisonChart.destroy();
        }
        window.comparisonChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: data.labels,
                datasets: data.datasets.map((dataset, i) => ({
                    ...dataset,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointBackgroundColor: dataset.borderColor,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    fill: true,
                    backgroundColor: i === 0
                        ? 'rgba(75, 192, 192, 0.15)'
                        : 'rgba(255, 99, 132, 0.15)',
                    tension: 0.2
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                },
                layout: {
                    padding: {
                        top: 10,
                        right: 10,
                        bottom: 10,
                        left: 10
                    }
                },
                plugins: {
                    title: {
                        display: false,
                        text: `${formatProductName(product)} Production Comparison (${year})`,
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        position: 'top',
                        labels: {
                            boxWidth: 12,
                            padding: 20,
                            font: {
                                size: 12
                            },
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                        titleFont: {
                            size: 14,
                            weight: 'bold'
                        },
                        bodyFont: {
                            size: 12
                        },
                        padding: 10,
                        cornerRadius: 6,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label;
                                const value = (context.raw / 100) * data.actual_values.max_production;
                                return `${label}: ${value.toLocaleString()} tons`;
                            }
                        }
                    }
                },
                scales: {
                    r: {
                        angleLines: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        grid: {
                            circular: true,
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        pointLabels: {
                            font: {
                                size: 11,
                                family: 'Arial'
                            },
                            color: '#555'
                        },
                        ticks: {
                            backdropColor: 'rgba(255, 255, 255, 0.8)',
                            z: 1,
                            callback: function(value) {
                                return `${value}%`;
                            },
                            stepSize: 20
                        },
                        suggestedMin: 0,
                        suggestedMax: 100
                    }
                },
                elements: {
                    line: {
                        borderWidth: 2.5
                    }
                }
            }
        });

        displayActualValues(data.actual_values);

    } catch (error) {
        console.error('Error in loadComparison:', error);
        const errorElement = document.createElement('div');
        errorElement.className = 'error';
        errorElement.textContent = `Error loading comparison: ${error.message}`;
        document.getElementById('radarChart').replaceWith(errorElement);
    }
}

function displayActualValues(values) {
    const container = document.getElementById('values-container');
    let html = `
        <h3>Actual Production Values</h3>
        <p>Maximum production: ${values.max_production.toLocaleString()} tons</p>
        <table>
            <tr>
                <th>Region</th>
                <th>Production (tons)</th>
                <th>% of Max</th>
            </tr>
    `;
    // Add top producers
    values.top_producers.forEach(producer => {
        const percent = (producer.production / values.max_production) * 100;
        html += `
            <tr>
                <td>${producer.region}</td>
                <td>${producer.production.toLocaleString()}</td>
                <td>${percent.toFixed(1)}%</td>
            </tr>
        `;
    });
    // Add selected country
    const selectedPercent = (values.selected_country.production / values.max_production) * 100;
    html += `
        <tr class="highlight">
            <td>${values.selected_country.region}</td>
            <td>${values.selected_country.production.toLocaleString()}</td>
            <td>${selectedPercent.toFixed(1)}%</td>
        </tr>
    </table>`;

    container.innerHTML = html;
}

// Start the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', initializeDashboard);
