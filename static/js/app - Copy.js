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
        stacked: document.getElementById('stackedChart'),
        scatter: document.getElementById('scatterChart'),
        stats: document.getElementById('statsChart'),
        decade: document.getElementById('decadeChart'),
        yearly: document.getElementById('yearlyChart')
    }
};

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
            fetchData('http://localhost:5000/api/countries'),
            fetchData('http://localhost:5000/api/years'),
            fetchData('http://localhost:5000/api/products')
        ]);

        populateSelect(domElements.entitySelect, countries, 'Select Country');
        populateSelect(domElements.yearSelect, years.sort((a, b) => b - a), 'Select Year');
        // For products, use raw value for the option value.
        populateSelect(domElements.productSelect, products, 'Select Product');
    } catch (error) {
        console.error('Error populating dropdowns:', error);
    }
}

function populateSelect(selectElement, options, placeholder) {
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    options.forEach(option => {
        const opt = document.createElement('option');
        // Convert option to a string before using includes()
        const optionStr = String(option);
        opt.value = optionStr;
        // Use formatted text if it contains an underscore
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
        updateStackedChart(currentFilters.year);
        updateDecadeChart();
        updateYearlyChart();
        loadSunburstChart();
        loadBubbleChart();
    }
    if (currentFilters.country && currentFilters.product) {
        updateTrendChart();
        updateBarChart();
        updateStatsChart();
        loadBubbleChart();
    }
}


// Formatting utility: Convert DB column name to user-friendly text
function formatProductName(product) {
    return product
        .replace(/_/g, ' ')
        .replace(/Production/i, 'Production')
        .trim();
}

// ---------------------
// Dynamic Charts
// ---------------------

// Update bar chart from /api/data/<country>/<year>
async function updateBarChart() {
  const entity = document.getElementById("entitySelect").value;
  const product = document.getElementById("productSelect").value;

  if (!entity || !product) {
    Plotly.purge("barChart");  // clear chart if no selection
    return;
  }

  fetch(`http://localhost:5000/api/trend/${entity}/${product}`)
    .then(res => res.json())
    .then(data => {
      const trace = {
        x: data.map(d => d.year),
        y: data.map(d => d.value),
        type: "bar",
        marker: { color: "#51b7e0" }
      };
      const layout = {
        title: `Bar Chart of ${product} Production in ${entity}`,
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
        const data = await fetchData(`http://localhost:5000/api/trend/${currentFilters.country}/${currentFilters.product}`);
        Plotly.react('trendChart', [{
            x: data.map(d => d.Year),
            y: data.map(d => d.production),
            type: 'scatter',
            mode: 'lines+markers',
            line: { shape: 'spline' },
            marker: { color: '#4ECDC4' }
        }], {
            title: `${currentFilters.country} Production Trend for ${formatProductName(currentFilters.product)}`,
            xaxis: { title: 'Year' },
            yaxis: { title: 'Tonnes' }
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
            `http://localhost:5000/api/map/${currentFilters.year}/${currentFilters.product}`
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
            colorscale: 'Greens',
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
                marker: { opacity: 0.3 }
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
                opacity: 0.8
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


// Function to update the stacked chart
async function updateStackedChart(year) {
    try {
        // Fetch data from the stacked chart API
        const response = await fetch(`http://localhost:5000/api/stacked/${year}`);

        // Check if the response is OK
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Parse the JSON data
        const data = await response.json();

        // Prepare data for Plotly
        const products = ['Maize_Production', 'Rice_Production', 'Wheat_Production'];
        const traces = products.map(product => ({
            x: data.map(d => d.Entity), // X-axis data (countries)
            y: data.map(d => d[product]), // Y-axis data (production values)
            name: formatProductName(product), // Name for the legend
            type: 'bar'
        }));

        // Define layout for the stacked chart
        const layout = {
            title: `Production Distribution (${year})`,
            barmode: 'stack', // Set to 'stack' for stacked bars
            xaxis: { title: 'Country', showticklabels: false },
            yaxis: { title: 'Tonnes' }
        };

        // Render the stacked chart using Plotly
        Plotly.newPlot('stackedChart', traces, layout);
    } catch (error) {
        console.error("Stacked chart error:", error);
    }
}

// Utility function to format product names
function formatProductName(product) {
    return product.replace(/_/g, ' ').replace(/Production/i, 'Production').trim();
}

// Utility function to format product names
function formatProductName(product) {
    return product.replace(/_/g, ' ').replace(/Production/i, 'Production').trim();
}


// ---------------------
// Fixed Charts Initialization (Summary Data)
// ---------------------
async function initializeFixedCharts() {
    try {
        const [decadeData, yearlyData, statsData] = await Promise.all([
            fetchData('http://localhost:5000/api/data/decade'),
            fetchData('http://localhost:5000/api/data/yearly'),
            fetchData('http://localhost:5000/api/stats')
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
    // Expect stats data as a nested dictionary: { FoodType: { mean, std, ... }, ... }
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
    fetch(`http://localhost:5000/api/data/decade?product=${product}`)
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
        })
        .then(data => {
            const trace = {
                x: data.map(d => d.decade), // Decade values
                y: data.map(d => d.production), // Average production values
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

    fetch(`http://localhost:5000/api/data/yearly`)
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


// Stats Chart
function updateStatsChart() {
    const product = document.getElementById("productSelect").value;
    if (!product) {
        Plotly.purge("statsChart");
        return;
    }

    fetch(`http://localhost:5000/api/data/stats?product=${encodeURIComponent(product)}`)
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

function loadBubbleChart() {
    fetch("http://localhost:5000/api/data/bubble")
        .then(res => {
            if (!res.ok) {
                throw new Error("Network response was not ok");
            }
            return res.json();
        })
        .then(data => {
            const countries = data.map(row => row.country);
            const totalProductions = data.map(row => row.total_production);

            const trace = {
                x: countries,
                y: totalProductions,
                mode: 'markers',
                marker: {
                    size: totalProductions, // Size of the bubbles based on production
                    color: totalProductions, // Color based on production
                    colorscale: 'Viridis',
                    showscale: true,
                },
                text: countries, // Hover text
            };

            const layout = {
                title: 'Crop Production by Country',
                xaxis: {
                    title: 'Country',
                },
                yaxis: {
                    title: 'Total Production',
                },
                showlegend: false,
            };

            Plotly.newPlot('bubbleChart', [trace], layout);
        })
        .catch(error => console.error("Bubble chart fetch failed:", error));
}

// Call the function to load the chart when the page is ready
document.addEventListener("DOMContentLoaded", loadBubbleChart);

// Start the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', initializeDashboard);
