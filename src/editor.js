document.addEventListener('DOMContentLoaded', () => {
    let gridW = parseInt(document.getElementById('grid-w').value);
    let gridH = parseInt(document.getElementById('grid-h').value);
    let currentTool = 1; // Default: Grass
    let gridData = [];
    let isDrawing = false;

    const gridContainer = document.getElementById('editor-grid');
    const resizeBtn = document.getElementById('resize-btn');
    const exportBtn = document.getElementById('export-btn');
    const outputArea = document.getElementById('output-area');
    const paletteButtons = document.querySelectorAll('.palette button');

    function initGrid() {
        gridW = parseInt(document.getElementById('grid-w').value);
        gridH = parseInt(document.getElementById('grid-h').value);

        gridContainer.style.gridTemplateColumns = `repeat(${gridW}, 30px)`;
        gridContainer.innerHTML = '';
        gridData = [];

        for (let z = 0; z < gridH; z++) {
            let row = [];
            for (let x = 0; x < gridW; x++) {
                // Initialize as empty (0)
                row.push(0); 

                const cell = document.createElement('div');
                cell.className = 'cell type-0';
                cell.dataset.x = x;
                cell.dataset.z = z;

                // Drawing event listeners
                cell.addEventListener('mousedown', (e) => {
                    isDrawing = true;
                    paint(cell);
                });
                cell.addEventListener('mouseenter', (e) => {
                    if (isDrawing) paint(cell);
                });

                gridContainer.appendChild(cell);
            }
            gridData.push(row);
        }
    }

    function paint(cell) {
        const x = cell.dataset.x;
        const z = cell.dataset.z;

        // If placing unique tiles like Start/Hole, optionally clear previous ones
        if (currentTool === 5 || currentTool === 6) {
            clearTypeFromGrid(currentTool);
        }

        gridData[z][x] = currentTool;
        cell.className = `cell type-${currentTool}`;
        if (currentTool === 5) cell.innerText = 'S';
        else if (currentTool === 6) cell.innerText = '';
        else cell.innerText = '';
    }

    function clearTypeFromGrid(type) {
        for (let z = 0; z < gridH; z++) {
            for (let x = 0; x < gridW; x++) {
                if (gridData[z][x] === type) {
                    gridData[z][x] = 1; // Revert to grass
                    const cell = document.querySelector(`.cell[data-x="${x}"][data-z="${z}"]`);
                    if (cell) {
                        cell.className = 'cell type-1';
                        cell.innerText = '';
                    }
                }
            }
        }
    }

    // Stop drawing on mouse up anywhere
    document.addEventListener('mouseup', () => {
        isDrawing = false;
    });

    // Tool Selection
    paletteButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            paletteButtons.forEach(b => b.classList.remove('active-tool'));
            e.target.classList.add('active-tool');
            currentTool = parseInt(e.target.dataset.type);
        });
    });

    resizeBtn.addEventListener('click', initGrid);

    exportBtn.addEventListener('click', () => {
        const out = {
            width: gridW,
            height: gridH,
            grid: gridData
        };
        const jsonStr = JSON.stringify(out);
        outputArea.value = jsonStr;
        outputArea.select();
    });

    initGrid();
});
