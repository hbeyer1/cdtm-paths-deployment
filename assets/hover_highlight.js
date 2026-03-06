// Hover highlighting and click-to-open for education path visualization
if (!window.dashExtensions) {
    window.dashExtensions = {};
}

window.dashExtensions.setupPathHighlighting = function() {
    console.log('Setting up path highlighting...');

    var graphDiv = document.getElementById('flow-diagram');
    if (!graphDiv) {
        console.log('Graph not found, retrying...');
        setTimeout(window.dashExtensions.setupPathHighlighting, 200);
        return;
    }

    // Wait for Plotly to be fully loaded
    if (!graphDiv.data || graphDiv.data.length === 0) {
        console.log('Graph data not loaded, retrying...');
        setTimeout(window.dashExtensions.setupPathHighlighting, 200);
        return;
    }

    console.log('Graph found with', graphDiv.data.length, 'traces');

    var hoveredPath = null;
    var listeners_attached = false;

    // Remove old listeners if they exist
    if (graphDiv._hasPathListeners) {
        Plotly.purge(graphDiv);
        console.log('Removed old listeners');
    }

    // Add hover listener
    graphDiv.on('plotly_hover', function(data) {
        console.log('Hover detected');
        var point = data.points[0];
        if (!point.data.customdata || !point.data.customdata[0]) return;

        var pathId = point.data.customdata[0][0];
        console.log('Hovering over path:', pathId);

        if (hoveredPath === pathId) return;
        hoveredPath = pathId;

        var update = {opacity: [], 'line.width': []};
        for (var i = 0; i < graphDiv.data.length; i++) {
            var trace = graphDiv.data[i];
            if (trace.mode === 'lines' && trace.customdata) {
                var tracePathId = trace.customdata[0][0];
                if (tracePathId === pathId) {
                    // Highlight this path
                    update.opacity.push(1.0);
                    update['line.width'].push(5);
                } else {
                    // Dim other paths heavily
                    update.opacity.push(0.03);
                    update['line.width'].push(1.5);
                }
            } else {
                // Keep nodes unchanged
                update.opacity.push(trace.opacity !== undefined ? trace.opacity : 1);
                update['line.width'].push(trace.marker ? trace.marker.size : 1);
            }
        }

        console.log('Applying hover style...');
        Plotly.restyle(graphDiv, update);
    });

    // Add unhover listener
    graphDiv.on('plotly_unhover', function(data) {
        console.log('Unhover detected');
        if (hoveredPath === null) return;
        hoveredPath = null;

        var update = {opacity: [], 'line.width': []};
        for (var i = 0; i < graphDiv.data.length; i++) {
            var trace = graphDiv.data[i];
            if (trace.mode === 'lines' && trace.customdata) {
                var originalAlpha = trace.customdata[0][2];
                update.opacity.push(originalAlpha);
                update['line.width'].push(2.5);
            } else {
                update.opacity.push(trace.opacity !== undefined ? trace.opacity : 1);
                update['line.width'].push(trace.marker ? trace.marker.size : 1);
            }
        }

        console.log('Resetting to normal style...');
        Plotly.restyle(graphDiv, update);
    });

    // Add click listener for LinkedIn
    graphDiv.on('plotly_click', function(data) {
        console.log('Click detected');
        var point = data.points[0];
        if (!point.data.customdata || !point.data.customdata[0]) return;

        var linkedinUrl = point.data.customdata[0][3];
        if (linkedinUrl) {
            console.log('Opening LinkedIn:', linkedinUrl);
            window.open(linkedinUrl, '_blank');
        }
    });

    graphDiv._hasPathListeners = true;
    console.log('Path highlighting setup complete!');
};

// Try to set up immediately
window.dashExtensions.setupPathHighlighting();

// Also try after DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, setting up path highlighting');
    window.dashExtensions.setupPathHighlighting();
});

// Set up after a delay to catch late-loading graphs
setTimeout(function() {
    console.log('Delayed setup of path highlighting');
    window.dashExtensions.setupPathHighlighting();
}, 1000);
