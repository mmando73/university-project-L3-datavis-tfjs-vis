// Imports et déclarations globales
import { DMiNer_error } from "../common/Settings.js";
import { update } from "tar";

declare const tfvis: any; // https://js.tensorflow.org/api_vis/latest/

/**********************************
 * Configurations centralisées
 **********************************/

const CONFIG = {
    general: {
        width: 1300,
        height: 700,
        fontSize: 12,
        zoomToFit: true,
        //xType: 'nominal', 
        //yType: 'nominal', 
        seriesColor: ['#1f77b4'],
        color: '#1f77b4'
    },
    heatmap: {
        colorMap: 'viridis'
    },
    histogram: {
        stats: false as boolean | '',// Peut être false ou ''
        maxBins: 20
    }
};

/**********************************
 * Utilitaires généraux
 **********************************/

// Afficher un ou plusieurs éléments HTML
function showHTMLElements(...elements: (HTMLElement | { label: HTMLLabelElement; field: HTMLElement })[]): void {
    elements.forEach((e) => {
        if (e instanceof HTMLElement) {
            // Si c'est un élément HTML, on l'affiche
            e.style.display = '';
        } else if ('label' in e && 'field' in e) {
            // Si c'est un objet { label, field }, on affiche les deux
            e.label.style.display = '';
            e.field.style.display = '';
        }
    });
}

// Cacher un ou plusieurs éléments HTML
function hideHTMLElements(...elements: (HTMLElement | { label: HTMLLabelElement; field: HTMLElement })[]): void {
    elements.forEach((e) => {
        if (e instanceof HTMLElement) {
            e.style.display = 'none';
        } else if ('label' in e && 'field' in e) {
            e.label.style.display = 'none';
            e.field.style.display = 'none';
        }
    });
}

// Gestion centralisée des erreurs
function handleError(context: string, error: unknown): never {
    console.error(`Erreur dans ${context} :`, error);
    throw new Error(DMiNer_error.No_possible_visualization);
}

// Fonction de tri générique (numérique ou lexicographique)
function sortFunction(a: any, b: any): number {
    if (!isNaN(a) && !isNaN(b)) {
        return Number(a) - Number(b); // Tri numérique
    } else {
        return String(a).localeCompare(String(b)); // Tri lexicographique
    }
}

/**********************************
 * Fonctions de validation et de transformation des données
 **********************************/

// Identifier les colonnes numériques dans les données
function identifyNumericColumns(
    data: Readonly<Array<Object>>,
    features: Readonly<Array<string>>,
    types: Readonly<Array<string>>
): Array<string> {
    return features.filter((feature, index) => {
        // On check si c’est un type DMN “number” ou si c’est un enum qui *contient* des nombres
        if (types[index] === 'number') {
            // Alors c’est direct numeric
            return true;
        } else if (types[index] === 'enum') {
            // Vérif supplémentaire : si *tous* les enregistrements sont des nombres
            return data.every(datum => typeof (datum as any)[feature] === 'number');
        }
        return false;
    });
}

// Trier un tableau d'objets selon une clé et un ordre
function sortData(
    data: Array<Record<string, any>>,
    key: string,
    order: 'asc' | 'desc' = 'asc'
): Array<Record<string, any>> {
    if (!key || !data || data.length === 0) return data;

    return data.slice().sort((a, b) => {
        const valA = a[key];
        const valB = b[key];

        // Comparaison pour les nombres
        if (typeof valA === 'number' && typeof valB === 'number') {
            return order === 'asc' ? valA - valB : valB - valA;
        }

        // Comparaison pour les chaînes de caractères
        if (typeof valA === 'string' && typeof valB === 'string') {
            return order === 'asc'
                ? valA.localeCompare(valB)
                : valB.localeCompare(valA);
        }

        // Comparaison par défaut pour types mixtes ou valeurs nulles
        return 0;
    });
}

// Normaliser les colonnes numériques
function applyNormalization(
    data: Readonly<Array<Object>>,
    numericFeatures: Array<string>
): Array<Object> {
    const normalizedData = JSON.parse(JSON.stringify(data)); // Deep clone la data

    numericFeatures.forEach(feature => {
        const values = normalizedData.map((d: any) => (d as any)[feature]);
        const min = Math.min(...values);
        const max = Math.max(...values);

        if (min !== max) {
            normalizedData.forEach((datum: any) => {
                (datum as any)[feature] = ((datum as any)[feature] - min) / (max - min);
            });
        }
    });

    return normalizedData;
}

// Retirer les valeurs aberrantes (outliers) d'un ensemble de données
function removeOutliers(
    data: Readonly<Array<Object>>,
    numericFeatures: Array<string>,
    threshold: number = 1.5
): Array<Object> {
    const filteredData = JSON.parse(JSON.stringify(data)); // Deep clone la data
    numericFeatures.forEach(feature => {
        // Extraction des valeurs associées à la caractéristique
        const values = filteredData.map((d: any) => d[feature]);

        // Calcul de Q1 (1er quartile) et Q3 (3e quartile)
        const sortedValues = [...values].sort((a, b) => a - b);
        const Q1 = sortedValues[Math.floor((sortedValues.length / 4))];
        const Q3 = sortedValues[Math.floor((sortedValues.length * 3) / 4)];

        // Calcul de l'écart interquartile (IQR) et des bornes
        const IQR = Q3 - Q1;
        const lowerBound = Q1 - threshold * IQR; // Borne inférieure
        const upperBound = Q3 + threshold * IQR; // Borne supérieure

        // Filtrer et supprimer les points de données en dehors des bornes
        for (let i = filteredData.length - 1; i >= 0; i--) {
            const value = (filteredData[i] as any)[feature];
            if (value < lowerBound || value > upperBound) {
                filteredData.splice(i, 1); // Supprime l'élément aberrant
            }
        }
    });

    return filteredData;
}

// Construit une matrice pour le graphique de type 'Heatmap'
function buildHeatmapData(
    data: Array<Object>,
    rowFeature: string,
    colFeature: string,
    valueFeature: string
): { values: number[][], rowLabels: string[], colLabels: string[] } {

    let rowLabels = Array.from(new Set(data.map(d => (d as any)[rowFeature])));
    let colLabels = Array.from(new Set(data.map(d => (d as any)[colFeature])));

    rowLabels.sort(sortFunction);
    colLabels.sort(sortFunction);

    // Construire la matrice dans le bon ordre
    const matrix = Array(rowLabels.length).fill(0).map(() =>
        Array(colLabels.length).fill(0)
    );

    data.forEach(datum => {
        const rowIndex = rowLabels.indexOf((datum as any)[rowFeature]);
        const colIndex = colLabels.indexOf((datum as any)[colFeature]);
        if (rowIndex >= 0 && colIndex >= 0) {
            matrix[rowIndex][colIndex] += (datum as any)[valueFeature] as number;
        }
    });

    return { values: matrix, rowLabels, colLabels };
}

/**********************************
 * Agrégation des données
 **********************************/

// Agréger les données selon un groupe et une méthode
function aggregateData(
    data: Readonly<Array<Object>>,
    groupFeature: string,
    numericFeature: string,
    method: 'sum' | 'average' | 'median' | 'min' | 'max'
): Array<{ group: string | number; value: number }> {
    // Si data est vide, on retourne un tableau vide
    if (!data || data.length === 0) {
        console.warn('aggregateData: dataset is empty!');
        return [];
    }

    // Map qui associe un groupFeature (ex: version) à la liste des valeurs (ex: salaires)
    const groupsMap = new Map<string | number, number[]>();

    for (const row of data) {
        const g = (row as any)[groupFeature];
        const val = (row as any)[numericFeature];

        // Filtrer les entrées invalides
        if (g == null || val == null || typeof val !== 'number' || isNaN(val)) continue;

        // On peut laisser tel quel si c'est un nombre.
        const groupKey: string | number = typeof g === 'number' || typeof g === 'string' ? g : String(g);

        if (!groupsMap.has(groupKey)) {
            groupsMap.set(groupKey, []);
        }
        groupsMap.get(groupKey)!.push(val);
    }

    const aggregatedData: Array<{ group: string | number; value: number }> = [];
    for (const [group, values] of groupsMap.entries()) {
        if (values.length === 0) continue;

        let aggregatedValue: number;
        switch (method) {
            case 'sum':
                aggregatedValue = values.reduce((sum, v) => sum + v, 0);
                break;
            case 'average':
                aggregatedValue = values.reduce((sum, v) => sum + v, 0) / values.length;
                break;
            case 'median':
                const sortedVals = [...values].sort((a, b) => a - b);
                const mid = Math.floor(sortedVals.length / 2);
                aggregatedValue = (sortedVals.length % 2 === 0)
                    ? (sortedVals[mid - 1] + sortedVals[mid]) / 2
                    : sortedVals[mid];
                break;
            case 'min':
                aggregatedValue = Math.min(...values);
                break;
            case 'max':
                aggregatedValue = Math.max(...values);
                break;
            default:
                // Par défaut, on peut faire la moyenne
                aggregatedValue = values.reduce((sum, v) => sum + v, 0) / values.length;
        }

        aggregatedData.push({ group, value: aggregatedValue });
    }

    // On trie par ordre croissant de group si c'est un nombre
    // (par exemple, si groupFeature = "Version")
    aggregatedData.sort((a, b) => {
        if (typeof a.group === 'number' && typeof b.group === 'number') {
            return a.group - b.group;
        }
        // sinon tri lexicographique pour des strings
        return String(a.group).localeCompare(String(b.group));
    });

    return aggregatedData;
}

/**********************************
 * Éléments d'interface utilisateur (UI)
 **********************************/

// Crée une checkbox avec une étiquette
function createLabeledCheckbox(id: string, labelText: string, controlsContainer: HTMLDivElement): {
    label: HTMLLabelElement,
    field: HTMLInputElement
} {
    const container = document.createElement('div');
    container.className = 'field-row';

    const checkbox = document.createElement('input');
    const label = document.createElement('label');

    checkbox.type = 'checkbox';
    checkbox.id = id;

    label.htmlFor = id;
    label.innerText = labelText;

    hideHTMLElements(label, checkbox);

    container.appendChild(label);
    container.appendChild(checkbox);
    controlsContainer.appendChild(container);

    return { label: label, field: checkbox };
}


// Crée un champ d'entrée avec une étiquette
function createLabeledInput(id: string, labelText: string, controlsContainer: HTMLDivElement, type: string, defaultValue: string, min?: string, step?: string): {
    label: HTMLLabelElement,
    field: HTMLInputElement
} {
    const container = document.createElement('div');
    container.className = 'field-row';

    const label = document.createElement('label');
    label.innerText = labelText;

    const input = document.createElement('input');
    input.type = type;
    input.value = defaultValue;
    input.id = id;

    if (min) input.min = min;
    if (step) input.step = step;

    hideHTMLElements(label, input);

    container.appendChild(label);
    container.appendChild(input);
    controlsContainer.appendChild(container);

    return { label: label, field: input };
}


// Crée un dropdown avec une étiquette
function createLabeledDropdown(id: string, options: Array<string>, controlsContainer: HTMLDivElement, labelText: string): {
    label: HTMLLabelElement,
    field: HTMLSelectElement
} {
    const container = document.createElement('div');
    container.className = 'field-row';

    const label = document.createElement('label');
    label.innerText = labelText;

    const select = document.createElement('select');
    select.id = id;
    const defOpt = document.createElement('option');
    defOpt.value = "";
    defOpt.text = "--Please choose an option--";
    defOpt.disabled = true;
    defOpt.selected = true;
    select.appendChild(defOpt);

    options.sort(sortFunction).forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.innerText = option;
        select.appendChild(opt);
    });

    select.onchange = () => {
        const emptyOption = Array.from(select.options).find(opt => opt.value === "");
        if (emptyOption) {
            select.removeChild(emptyOption);
        }
    }

    hideHTMLElements(label, select);

    container.appendChild(label);
    container.appendChild(select);
    controlsContainer.appendChild(container);

    return { label: label, field: select };
}


// Crée un dropdown avec une étiquette plus une option par défaut personalisée
function createLabeledDropdownWithType(id: string, options: Array<string>, controlsContainer: HTMLDivElement, labelText: string, selectType?: string): {
    label: HTMLLabelElement,
    field: HTMLSelectElement
} {
    const { label, field } = createLabeledDropdown(id, options, controlsContainer, labelText);

    // Ajuster le texte défaut selon selectType
    const defOpt = field.querySelector('option[value=""]') as HTMLOptionElement;
    if (selectType) {
        switch (selectType) {
            case 'chartType':
                defOpt.text = "Please choose a chart type";
                break;
            case 'aggregationMethod':
                defOpt.text = "Choose an aggregation method (average by default)";
                break;
            case 'rowFeature':
                defOpt.text = "Choose a row feature";
                break;
            case 'colFeature':
                defOpt.text = "Choose a col feature";
                break;
            case 'valFeature':
                defOpt.text = "Choose a value feature";
                break;
            case 'filterFeature':
                defOpt.text = "Choose a filter feature";
                break;
            case 'filterOperator':
                defOpt.text = "Choose an operator";
                break;
            case 'value':
                defOpt.text = "Choose a value";
                break;
            case 'xType':
                defOpt.text = "Choose a type for the x dataset";
                break;
            case 'yType':
                defOpt.text = "Choose a type for the y dataset";
                break;
            case 'colorMap':
                defOpt.text = "Choose a color map";
                break;
            case 'sortColumn':
                defOpt.text = "Choose a column to sort by";
                break;
            case 'sortOrder':
                defOpt.text = "Choose a sort order";
                break;
            default:
                defOpt.text = "--Please choose an option--";
                break;
        }
    }

    return { label, field };
}


// Crée une option par défaut personalisée
function createSelectionDefaultOption(defaultOptLabel: string): HTMLOptionElement {
    const opt = document.createElement('option');
    opt.value = "";
    opt.text = defaultOptLabel;
    opt.disabled = true;
    opt.selected = true;
    return opt;
}

// Met à jour les selecteurs des axes X et Y avec les 'features' correspondantes
function updateAxisSelectors(
    xAxisDropdown: HTMLSelectElement,
    yAxisDropdown: HTMLSelectElement,
    numericFeatures: Array<string>
): void {
    xAxisDropdown.innerHTML = '';
    yAxisDropdown.innerHTML = '';

    numericFeatures.forEach(feature => {
        const xOption = document.createElement('option');
        const yOption = document.createElement('option');

        xOption.value = feature;
        xOption.innerText = feature;

        yOption.value = feature;
        yOption.innerText = feature;

        xAxisDropdown.appendChild(xOption);
        yAxisDropdown.appendChild(yOption);
    });
    xAxisDropdown.appendChild(createSelectionDefaultOption("Chose a dataset to be assigned to the X Axis"));
    yAxisDropdown.appendChild(createSelectionDefaultOption("Chose a dataset to be assigned to the Y Axis"));
}


// Crée une section (pour les contrôles) avec un titre
function createSection(title: string, parent: HTMLElement): HTMLDivElement {
    const section = document.createElement('div');
    section.className = 'control-section';

    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'section-title';
    sectionTitle.innerHTML = title;

    hideHTMLElements(section);

    section.appendChild(sectionTitle);
    parent.appendChild(section);
    return section;
}

/*************************************************
 * Création des parties de contrôles des données
 *************************************************/

interface ControlElements {
    container: HTMLDivElement;
    sections: {
        chartSection: HTMLDivElement;
        axesSection: HTMLDivElement;
        dataProcessingSection: HTMLDivElement;
        heatmapSection: HTMLDivElement;
        filtersSection: HTMLDivElement;
    };
    chart: {
        chartTypeDropdown: { label: HTMLLabelElement; field: HTMLSelectElement };
        fontSizeInput: { label: HTMLLabelElement; field: HTMLInputElement };
        //xTypeDropdown: {label: HTMLLabelElement; field: HTMLSelectElement};
        //yTypeDropdown: {label: HTMLLabelElement; field: HTMLSelectElement};
    };
    axes: {
        xAxisDatasetDropdown: { label: HTMLLabelElement; field: HTMLSelectElement };
        yAxisDatasetDropdown: { label: HTMLLabelElement; field: HTMLSelectElement };
    };
    dataProcessing: {
        normalizeCheckbox: { label: HTMLLabelElement; field: HTMLInputElement };
        removeOutliersCheckbox: { label: HTMLLabelElement; field: HTMLInputElement };
        outlierThresholdInput: { label: HTMLLabelElement; field: HTMLInputElement };
        applyAggregationCheckbox: { label: HTMLLabelElement; field: HTMLInputElement };
        aggregationDropdown: { label: HTMLLabelElement; field: HTMLSelectElement };
    };
    heatmap: {
        rowDropdown: { label: HTMLLabelElement; field: HTMLSelectElement };
        colDropdown: { label: HTMLLabelElement; field: HTMLSelectElement };
        valDropdown: { label: HTMLLabelElement; field: HTMLSelectElement };
        colorMapDropdown: { label: HTMLLabelElement; field: HTMLSelectElement };
    };
    histogram: {
        maxBinsInput: { label: HTMLLabelElement; field: HTMLInputElement };
        statsCheckbox: { label: HTMLLabelElement; field: HTMLInputElement };
        histColorInput: { label: HTMLLabelElement; field: HTMLInputElement };
    };
    bar: {
        barColorInput: { label: HTMLLabelElement; field: HTMLInputElement };
    };
    lineScatter: {
        lsColorInput: { label: HTMLLabelElement; field: HTMLInputElement };
    };
    tableSorting: {
        sortColumnDropdown: { label: HTMLLabelElement; field: HTMLSelectElement };
        sortOrderDropdown: { label: HTMLLabelElement; field: HTMLSelectElement };
    }
}

// Crée le conteneur principal de contrôles pour les visualisations.
function createControlDiv(
    numericFeatures: string[],
    features: string[],
    controlsSurface: any
): ControlElements {
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'viz_ui controls_area';
    controlsContainer.id = "tfjs-viz-ui";

    // Créer des sections principales
    const chartSection = createSection('Chart Configuration', controlsContainer);
    const axesSection = createSection('Axes Configuration', controlsContainer);
    const dataProcessingSection = createSection('Data Processing', controlsContainer);
    const heatmapSection = createSection('Heatmap Configuration', controlsContainer);
    const filtersSection = createSection('Filters', controlsContainer); // Nouvelle section pour les filtres

    // --- Chart Configuration ---
    const chartTypeDropdown = createLabeledDropdownWithType(
        'chartTypeDropdown',
        ['Line Chart', 'Bar Chart', 'Scatter Plot', 'Heatmap', 'Histogram', 'Table'],
        chartSection,
        'Chart type: ',
        'chartType'
    );
    chartSection.appendChild(document.createElement('hr'));
    const fontSizeInput = createLabeledInput('fontSizeInput', "Font size:", chartSection, "number", "12", "1", "1");
    //const xTypeDropdown = createLabeledDropdownWithType(['nominal', 'ordinal', 'quantitative'], chartSection, 'xType: ', 'xType');
    //const yTypeDropdown = createLabeledDropdownWithType(['nominal', 'ordinal', 'quantitative'], chartSection, 'yType: ', 'yType');


    // --- Axes Configuration ---
    const xAxisDatasetDropdown = createLabeledDropdownWithType('xAxisDatasetDropdown', numericFeatures, axesSection, 'X Axis: ');
    const yAxisDatasetDropdown = createLabeledDropdownWithType('yAxisDatasetDropdown', numericFeatures, axesSection, 'Y Axis: ');
    updateAxisSelectors(xAxisDatasetDropdown.field, yAxisDatasetDropdown.field, numericFeatures);

    // --- Data Processing ---
    const normalizeCheckbox = createLabeledCheckbox('normalize', 'Normalize Data', dataProcessingSection);
    const removeOutliersCheckbox = createLabeledCheckbox('removeOutliers', 'Remove Outliers', dataProcessingSection);
    const outlierThresholdInput = createLabeledInput('outlierThresholdInput', 'Outlier Threshold:', dataProcessingSection, 'number', '1.5', '0', '0.025');
    const applyAggregationCheckbox = createLabeledCheckbox('applyAggregation', 'Apply Aggregation', dataProcessingSection);
    const aggregationDropdown = createLabeledDropdownWithType('aggregationDropdown', ['sum', 'average', 'median', 'max', 'min'], dataProcessingSection, 'Aggregation Method:', 'aggregationMethod');

    // --- Heatmap Configuration ---
    const rowDropdown = createLabeledDropdownWithType('rowDropdown', features, heatmapSection, 'Row feature:', 'rowFeature');
    const colDropdown = createLabeledDropdownWithType('colDropdown', features, heatmapSection, 'Col feature:', 'colFeature');
    const valDropdown = createLabeledDropdownWithType('valDropdown', numericFeatures, heatmapSection, 'Value feature:', 'valFeature');
    const colorMapDropdown = createLabeledDropdownWithType('colorMapDropdown', ['viridis', 'greyscale', 'blues'], heatmapSection, "Color map:", 'colorMap');

    // Histogram options:
    const maxBinsInput = createLabeledInput('maxBinsInput', "Max bins:", chartSection, "number", "20", "1");
    const statsCheckbox = createLabeledCheckbox('statsCheckbox', 'Show stats', chartSection);
    const histColorInput = createLabeledInput('histColorInput', "Histogram color:", chartSection, "color", `${CONFIG.general.color}`);

    // Line/Scatter options:
    const lsColorInput = createLabeledInput('lsColorInput', "Series Color (single):", chartSection, "color", `${CONFIG.general.seriesColor[0]}`);

    // Bar options:
    const barColorInput = createLabeledInput('barColorInput', "Barchart Color:", chartSection, "color", `${CONFIG.general.color}`);

    // Ajouter les controls de tri (pour le type Table)
    const sortColumnDropdown = createLabeledDropdownWithType('sortColumnDropdown', features, chartSection, "Sort column:", 'sortColumn');
    const sortOrderDropdown = createLabeledDropdownWithType('sortOrderDropdown', ['asc', 'desc'], chartSection, "Sort order:", 'sortOrder');


    // Ajouter les contrôles au conteneur principal
    controlsSurface.drawArea.appendChild(controlsContainer);

    // Retourner tous les éléments organisés dans l'interface
    return {
        container: controlsContainer,
        sections: {
            chartSection,
            axesSection,
            dataProcessingSection,
            heatmapSection,
            filtersSection
        },
        chart: {
            chartTypeDropdown,
            fontSizeInput,
            //xTypeDropdown,
            //yTypeDropdown
        },
        axes: {
            xAxisDatasetDropdown,
            yAxisDatasetDropdown
        },
        dataProcessing: {
            normalizeCheckbox,
            removeOutliersCheckbox,
            outlierThresholdInput,
            applyAggregationCheckbox,
            aggregationDropdown
        },
        heatmap: {
            rowDropdown,
            colDropdown,
            valDropdown,
            colorMapDropdown
        },
        histogram: {
            maxBinsInput,
            statsCheckbox,
            histColorInput
        },
        bar: {
            barColorInput
        },
        lineScatter: {
            lsColorInput
        },
        tableSorting: {
            sortColumnDropdown,
            sortOrderDropdown
        }
    };
}


// Représente un seul filtre, p.ex. {column: "Version", operator: ">=", value: 10}
interface Filter {
    column: string;
    operator: string;
    value: any;
}

//  Crée la partie d'UI permettant d'ajouter des filtres dynamiques sur un ensemble de données
function createMultiFilterUI(
    data: ReadonlyArray<Object>,
    features: Array<string>,
    numericFeatures: ReadonlyArray<string>,
    container: HTMLElement,
    onFiltersChanged: (filters: Filter[]) => void
): void {
    const filtersMap = new Map<number, Filter>();
    let filterIdCounter = 0;

    const filterRows: { rowDiv: HTMLDivElement, hr?: HTMLHRElement }[] = [];
    const filterPanel = document.createElement('div');
    filterPanel.className = 'multi-filter-panel';
    container.appendChild(filterPanel);

    const addFilterButton = document.createElement('button');
    addFilterButton.innerText = 'Add filter';
    addFilterButton.className = 'add-filter-button';

    addFilterButton.onclick = () => {
        let hr: HTMLHRElement | undefined;
        if (filterRows.length > 0) {
            hr = document.createElement('hr');
            filterPanel.appendChild(hr);
        }

        const rowDiv = document.createElement('div');
        rowDiv.className = 'filter-row';
        filterPanel.appendChild(rowDiv);

        // Feature dropdown
        const { label: featureLabel, field: featureDropdown } = createLabeledDropdownWithType('filterFeatureDropdown', features, rowDiv, "Feature:", 'filterFeature');
        showHTMLElements({ label: featureLabel, field: featureDropdown });

        // Value numeric
        const { label: valLabel, field: valueInput } = createLabeledInput('filterValueInput', "Value:", rowDiv, "number", "0", "0");

        // Operator
        const { label: opLabel, field: operatorDropdown } = createLabeledDropdownWithType('filterOperatorDropdown', ['==', '<', '<=', '>', '>='], rowDiv, "Operator:", 'filterOperator');

        // Dropdown string values
        const { label: strValLabel, field: stringValueSelect } = createLabeledDropdownWithType('stringValueSelect', [], rowDiv, "Value:", 'value');


        const btnsDiv = document.createElement('div');
        btnsDiv.className = 'filter-buttons';

        const applyBtn = document.createElement('button');
        applyBtn.innerText = 'Apply';
        applyBtn.className = 'apply-filter-button';
        btnsDiv.appendChild(applyBtn);

        const removeBtn = document.createElement('button');
        removeBtn.innerText = 'Remove';
        removeBtn.className = 'remove-filter-button';
        btnsDiv.appendChild(removeBtn);

        rowDiv.appendChild(btnsDiv);

        hideHTMLElements(btnsDiv);

        // Cacher tant qu'aucune feature n'est choisie
        const hideOpValInput = () => {
            hideHTMLElements(
                { label: opLabel, field: operatorDropdown },
                { label: valLabel, field: valueInput },
                { label: strValLabel, field: stringValueSelect }
            );
        }

        hideOpValInput();

        featureDropdown.onchange = () => {
            const col = featureDropdown.value;
            if (col === "") {
                hideOpValInput();
                return;
            }

            if (numericFeatures.includes(col)) {
                showHTMLElements(
                    btnsDiv,
                    { label: opLabel, field: operatorDropdown },
                    { label: valLabel, field: valueInput }
                );
                hideHTMLElements({ label: strValLabel, field: stringValueSelect });
            } else {
                hideHTMLElements(
                    { label: opLabel, field: operatorDropdown },
                    { label: valLabel, field: valueInput }
                );
                showHTMLElements(btnsDiv, { label: strValLabel, field: stringValueSelect });

                const distinctVals = new Set<any>();
                data.forEach(d => {
                    const val = (d as any)[col];
                    if (val != null) distinctVals.add(val);
                });
                distinctVals.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = String(v);
                    opt.innerText = String(v);
                    stringValueSelect.appendChild(opt);
                });
            }
        };

        applyBtn.onclick = () => {
            const col = featureDropdown.value;
            if (col === "") return;

            let fil: Filter;
            if (numericFeatures.includes(col)) {
                const operator = operatorDropdown.value;
                const val = valueInput.value;
                fil = { column: col, operator, value: val };
            } else {
                const val = stringValueSelect.value;
                fil = { column: col, operator: '==', value: val };
            }

            // Vérifier si ce rowDiv a déjà un filterId
            let fid = rowDiv.dataset.filterId ? Number(rowDiv.dataset.filterId) : NaN;
            if (isNaN(fid)) {
                // Nouveau filtre
                fid = ++filterIdCounter;
                rowDiv.dataset.filterId = fid.toString();
            }
            filtersMap.set(fid, fil);
            onFiltersChanged(Array.from(filtersMap.values()));
        };

        removeBtn.onclick = () => {
            // Retrouver l'ID du filtre dans cette row
            const fid = rowDiv.dataset.filterId ? Number(rowDiv.dataset.filterId) : NaN;
            if (!isNaN(fid)) {
                // On supprime ce filtre
                filtersMap.delete(fid);
                onFiltersChanged(Array.from(filtersMap.values()));
            } //else {
            // Si aucun filtre n'a été appliqué, rien à retirer de filtersMap
            //}

            // Retirer le hr associé (s'il existe)
            if (hr) {
                filterPanel.removeChild(hr);
            }
            // Retirer la ligne
            filterPanel.removeChild(rowDiv);

            // Retirer la ligne du tableau
            const idx = filterRows.findIndex(fr => fr.rowDiv === rowDiv);
            if (idx !== -1) {
                filterRows.splice(idx, 1);
            }
        };

        filterRows.push({ rowDiv, hr });
    };

    container.appendChild(addFilterButton);
}


//  Extrait/injecte un Filter[] dans applyFiltering pour l'appliquer aux données après
function applyFiltering(data: Array<Object>, filters: Filter[]): Array<Object> {
    return data.filter(d => {
        return filters.every(fil => {
            const rowVal = (d as any)[fil.column];
            if (rowVal == null) return false;

            switch (fil.operator) {
                case '==': return rowVal == fil.value;
                case '<': return rowVal < +fil.value;
                case '<=': return rowVal <= +fil.value;
                case '>': return rowVal > +fil.value;
                case '>=': return rowVal >= +fil.value;
                default: return true;
            }
        });
    });
}

export default class Dataviz {
    static controlsCreated = false;

    // Variables statiques pour stocker les données actuelles
    static currentData: Readonly<Array<Object>> = [];
    static currentName: string = "";
    static currentFeatures: Readonly<Array<string>> = [];
    static currentTypes: Readonly<Array<string>> = [];
    static currentEnumerations: Readonly<Map<string, Array<boolean | number | string> | null>> = new Map();

    static controlsSurface: any = null;
    static chartSurface: any = null;
    static chartDiv: HTMLDivElement | null = null;

    static Setup(
        dataviz: {
            dataviz_area: HTMLDivElement,
            dataviz_handler: (stop: boolean) => void
        },
        data: Readonly<Array<Object>>,
        name: string,
        features: Readonly<Array<string>>,
        types: Readonly<Array<string>>,
        enumerations: Readonly<Map<string, Array<boolean | number | string> | null>>
    ): never | void {
        // 1. Mise à jour des variables statiques avec les nouvelles données
        Dataviz.currentData = data;
        Dataviz.currentName = name;
        Dataviz.currentFeatures = features;
        Dataviz.currentTypes = types;
        Dataviz.currentEnumerations = enumerations;

        // Initialisation de tfvis
        const visor = tfvis.visor();
        visor.open();
        if (!visor.isFullscreen()) visor.toggleFullScreen();

        // Identification des colonnes numériques
        const numericFeatures = identifyNumericColumns(Dataviz.currentData, Dataviz.currentFeatures, Dataviz.currentTypes);

        // Vérification des colonnes numériques disponibles
        if (numericFeatures.length === 0) {
            alert("Impossible d'afficher les graphiques : aucune colonne numérique détectée.");
            return;
        }

        // Variables pour les contrôles
        let filters: Filter[] = []
        let controlsSurface: any;

        // 2. Création des contrôles si non encore faits
        if (!Dataviz.controlsCreated) {
            controlsSurface = visor.surface({ name: 'Controls', tab: 'Visualizations', styles: { width: CONFIG.general.width } });

            // Création des éléments de contrôle
            const _features = JSON.parse(JSON.stringify(Dataviz.currentFeatures)); // Clone original
            const controls = createControlDiv(numericFeatures, _features, controlsSurface);

            // Initialisation des sections et des contrôles
            const {
                sections: { chartSection, axesSection, dataProcessingSection, heatmapSection, filtersSection },
                chart: { chartTypeDropdown, fontSizeInput },
                axes: { xAxisDatasetDropdown, yAxisDatasetDropdown },
                dataProcessing: { normalizeCheckbox, removeOutliersCheckbox, outlierThresholdInput, applyAggregationCheckbox, aggregationDropdown },
                heatmap: { rowDropdown, colDropdown, valDropdown, colorMapDropdown },
                histogram: { maxBinsInput, statsCheckbox, histColorInput },
                bar: { barColorInput },
                lineScatter: { lsColorInput },
                tableSorting: { sortColumnDropdown, sortOrderDropdown }
            } = controls;

            // Affichage initial des sections
            showHTMLElements(chartSection, chartTypeDropdown);

            // Gestion du changement de type de graphique
            chartTypeDropdown.field.addEventListener('change', () => {
                const ctype = chartTypeDropdown.field.value;

                if (ctype) showHTMLElements(fontSizeInput);

                // Réinitialisation des affichages
                hideHTMLElements(
                    axesSection, dataProcessingSection, heatmapSection, filtersSection,
                    maxBinsInput, statsCheckbox, histColorInput, barColorInput,
                    lsColorInput, colorMapDropdown, rowDropdown, colDropdown,
                    valDropdown, xAxisDatasetDropdown, yAxisDatasetDropdown,
                    normalizeCheckbox, removeOutliersCheckbox, outlierThresholdInput,
                    applyAggregationCheckbox, aggregationDropdown, sortColumnDropdown, sortOrderDropdown
                );

                // Affichage en fonction du type de graphique
                switch (ctype) {
                    case 'Heatmap':
                        showHTMLElements(heatmapSection, rowDropdown, colDropdown, valDropdown, colorMapDropdown, filtersSection);
                        break;
                    case 'Histogram':
                        showHTMLElements(axesSection, filtersSection, maxBinsInput, statsCheckbox, histColorInput, xAxisDatasetDropdown, yAxisDatasetDropdown);
                        break;
                    case 'Line Chart':
                    case 'Bar Chart':
                    case 'Scatter Plot':
                        showHTMLElements(axesSection, filtersSection, xAxisDatasetDropdown, yAxisDatasetDropdown);
                        if (ctype === 'Line Chart' || ctype === 'Bar Chart')
                            showHTMLElements(dataProcessingSection, normalizeCheckbox, removeOutliersCheckbox, outlierThresholdInput, applyAggregationCheckbox, aggregationDropdown);
                        if (ctype === 'Bar Chart')
                            showHTMLElements(barColorInput);
                        if (ctype === 'Line Chart' || ctype === 'Scatter Plot')
                            showHTMLElements(lsColorInput);
                        break;
                    case 'Table':
                        showHTMLElements(sortColumnDropdown, sortOrderDropdown, filtersSection);
                        break;
                    default:
                        showHTMLElements(chartSection, chartTypeDropdown, fontSizeInput);
                        break;
                }

                // Mise à jour du graphique
                updateChart();
            });

            // Ajout des listeners aux contrôles
            fontSizeInput.field.addEventListener('change', () => {
                CONFIG.general.fontSize = parseFloat(fontSizeInput.field.value);
                updateChart();
            });

            // xTypeDropdown.field.addEventListener('change', () => {
            //     CONFIG.general.xType = xTypeDropdown.field.value.toLowerCase();
            //     updateChart();
            // });
            //
            // yTypeDropdown.field.addEventListener('change', () => {
            //     CONFIG.general.xType = yTypeDropdown.field.value.toLowerCase();
            //     updateChart();
            // });

            barColorInput.field.addEventListener('change', () => {
                CONFIG.general.color = barColorInput.field.value;
                updateChart();
            });

            colorMapDropdown.field.addEventListener('change', () => {
                CONFIG.heatmap.colorMap = colorMapDropdown.field.value;
                updateChart();
            });

            maxBinsInput.field.addEventListener('change', () => {
                CONFIG.histogram.maxBins = parseInt(maxBinsInput.field.value);
                updateChart();
            });

            statsCheckbox.field.addEventListener('change', () => {
                CONFIG.histogram.stats = statsCheckbox.field.checked ? '' : false;
                updateChart();
            });

            histColorInput.field.addEventListener('change', () => {
                CONFIG.general.color = histColorInput.field.value;
                updateChart();
            });

            lsColorInput.field.addEventListener('change', () => {
                CONFIG.general.seriesColor[0] = lsColorInput.field.value;
                updateChart();
            });

            // Gestion des mises à jour des axes et des données
            xAxisDatasetDropdown.field.addEventListener('change', updateChart);
            yAxisDatasetDropdown.field.addEventListener('change', updateChart);
            normalizeCheckbox.field.addEventListener('change', updateChart);
            applyAggregationCheckbox.field.addEventListener('change', updateChart);
            removeOutliersCheckbox.field.addEventListener('change', updateChart);
            outlierThresholdInput.field.addEventListener('input', updateChart);
            aggregationDropdown.field.addEventListener('change', updateChart);
            rowDropdown.field.addEventListener('change', updateChart);
            colDropdown.field.addEventListener('change', updateChart);
            valDropdown.field.addEventListener('change', updateChart);
            sortColumnDropdown.field.addEventListener('change', updateChart);
            sortOrderDropdown.field.addEventListener('change', updateChart);

            createMultiFilterUI(data, _features, numericFeatures, controls.sections.filtersSection, onFiltersChanged);

            function onFiltersChanged(newFilters: Filter[]) {
                filters = newFilters;
                updateChart();
            }

            Dataviz.controlsCreated = true; // Empêche la recréation des contrôles

        }

        // Gestion du graphique
        let chartDiv: HTMLDivElement;
        if (!Dataviz.chartDiv) {
            chartDiv = document.createElement('div');
            chartDiv.style.width = `${CONFIG.general.width}`;
            chartDiv.style.height = `${CONFIG.general.height}`;
            const chartSurface = visor.surface({ name: 'Chart', tab: 'Visualizations', styles: { width: CONFIG.general.width, height: CONFIG.general.height } });
            chartSurface.drawArea.appendChild(chartDiv);

            Dataviz.chartDiv = chartDiv;
            Dataviz.chartSurface = chartSurface;
        } else {
            Dataviz.chartDiv.innerHTML = ""; // Nettoyage avant le prochain rendu
        }

        updateChart();

        function updateChart(): void {
            const chartType = (document.getElementById('chartTypeDropdown') as HTMLSelectElement).value;

            const xFeature = (document.getElementById('xAxisDatasetDropdown') as HTMLSelectElement).value;
            const yFeature = (document.getElementById('yAxisDatasetDropdown') as HTMLSelectElement).value;

            const normalize = (document.getElementById('normalize') as HTMLInputElement).checked;
            const removeOutliersChecked = (document.getElementById('removeOutliers') as HTMLInputElement).checked;
            const threshold = parseFloat((document.getElementById('outlierThresholdInput') as HTMLInputElement).value) || 1.5;
            const applyAggregation = (document.getElementById('applyAggregation') as HTMLInputElement).checked;
            const aggregationMethod = (document.getElementById('aggregationDropdown') as HTMLSelectElement).value as 'sum' | 'average' | 'median' | 'min' | 'max';

            const rowFeature = (document.getElementById('rowDropdown') as HTMLSelectElement).value;
            const colFeature = (document.getElementById('colDropdown') as HTMLSelectElement).value;
            const valueFeature = (document.getElementById('valDropdown') as HTMLSelectElement).value;

            const sortColumn = (document.getElementById('sortColumnDropdown') as HTMLSelectElement).value;
            const sortOrder = (document.getElementById('sortOrderDropdown') as HTMLSelectElement).value as ('asc' | 'desc' | '');


            // Données à utiliser
            let datasetToUse = JSON.parse(JSON.stringify(Dataviz.currentData)); // Clonage

            if (filters.length > 0) {
                datasetToUse = applyFiltering(datasetToUse, filters);
            }

            if (removeOutliersChecked) {
                datasetToUse = removeOutliers(datasetToUse, numericFeatures, threshold);
            }

            if (normalize) {
                datasetToUse = applyNormalization(datasetToUse, numericFeatures);
            }

            // Si on veut agréger par "Version" pour n’avoir plus qu’une seule ligne par version :
            if (applyAggregation && (chartType === 'Bar Chart' || chartType === 'Line Chart')) {
                // ex. groupFeature = xFeature
                datasetToUse = aggregateData(datasetToUse, xFeature, yFeature, aggregationMethod);
                // Après agrégation => tableau = [ { group, value }, ... ]
                // On renomme "group" -> xFeature, "value" -> yFeature
                datasetToUse = datasetToUse.map((d: { group: any; value: any; }) => ({
                    //...d, ?
                    [xFeature]: d.group,
                    [yFeature]: d.value
                }));
            }


            const chartRenderHeight = 0.9 * CONFIG.general.height;
            const chartRenderWidth = 0.95 * CONFIG.general.width;

            Dataviz.chartDiv!.innerHTML = ""; // Nettoyage
            switch (chartType) {
                case 'Line Chart':
                    Dataviz._Linechart(chartDiv!, datasetToUse, xFeature, yFeature, chartRenderHeight, chartRenderWidth);
                    break;
                case 'Bar Chart':
                    Dataviz._Barchart(chartDiv!, datasetToUse, xFeature, yFeature, chartRenderHeight, chartRenderWidth);
                    break;
                case 'Scatter Plot':
                    Dataviz._Scatterplot(chartDiv!, datasetToUse, xFeature, yFeature, chartRenderHeight, chartRenderWidth);
                    break;
                case 'Heatmap':
                    Dataviz._Heatmap(chartDiv!, datasetToUse, rowFeature, colFeature, valueFeature, chartRenderHeight, chartRenderWidth);
                    break;
                case 'Histogram':
                    Dataviz._Histogram(chartDiv!, datasetToUse, xFeature, chartRenderHeight, chartRenderWidth);
                    break;
                case 'Table':
                    if (sortColumn && sortColumn !== "" && sortOrder) {
                        datasetToUse = sortData(datasetToUse, sortColumn, sortOrder as 'asc' | 'desc');
                    }
                    Dataviz._Table(chartDiv!, datasetToUse, Dataviz.currentFeatures);
                    break;
            }
        }
    }

    // Méthode pour afficher un graphique de type Line Chart
    private static _Linechart(
        dataviz_area: HTMLDivElement,
        data: Readonly<Array<Object>>,
        xFeature: string,
        yFeature: string,
        height: number,
        width: number
    ): never | void {
        try {
            // Préparer les données pour tfvis.render.linechart
            const line = data.map(datum => ({
                x: (datum as any)[xFeature] as number,
                y: (datum as any)[yFeature] as number
            })); // Tri croissant sur l'axe X

            line.sort((a, b) => a.x - b.x);

            const data_ = { values: [line], series: [yFeature] };

            // Rendu du graphique
            tfvis.render.linechart(dataviz_area, data_, {
                xLabel: xFeature,
                yLabel: yFeature,
                width,
                height,
                fontSize: CONFIG.general.fontSize,
                zoomToFit: CONFIG.general.zoomToFit,
                //xType: CONFIG.general.xType,
                //yType: CONFIG.general.yType,
                seriesColors: CONFIG.general.seriesColor
            });
        } catch (error: unknown) {
            handleError('_Linechart', error);
        }
    }

    // Méthode pour afficher un graphique de type Bar Chart
    private static _Barchart(
        dataviz_area: HTMLDivElement,
        data: Readonly<Array<Object>>,
        xFeature: string,
        yFeature: string,
        height: number,
        width: number
    ): never | void {
        try {
            // Préparer les données pour tfvis.render.barchart
            const data_ = data.map(datum => ({
                index: (datum as any)[xFeature], // ex: 1, 2, 3...
                value: (datum as any)[yFeature]  // ex: aggregated salary
            }));

            // Rendu du graphique
            tfvis.render.barchart(dataviz_area, data_, {
                xLabel: xFeature,
                yLabel: yFeature,
                width,
                height,
                fontSize: CONFIG.general.fontSize,
                zoomToFit: CONFIG.general.zoomToFit,
                //xType: CONFIG.general.xType,
                //yType: CONFIG.general.yType,
                color: CONFIG.general.color,
                timestamp: Date.now() // test pour contourner le problème de non generation si les opts non changées => OUI ça résoud le problème :)
            });
        } catch (error: unknown) {
            handleError('_Barchart', error);
        }
    }

    // Méthode pour afficher un graphique de type Scatter Plot
    private static _Scatterplot(
        dataviz_area: HTMLDivElement,
        data: Readonly<Array<Object>>,
        xFeature: string,
        yFeature: string,
        height: number,
        width: number
    ): never | void {
        try {
            // Préparer les données pour tfvis.render.scatterplot
            const scatterValues = data.map(datum => ({
                x: (datum as any)[xFeature] as number,
                y: (datum as any)[yFeature] as number
            }));

            const data_ = { values: [scatterValues], series: [yFeature] };

            // Rendu du graphique
            tfvis.render.scatterplot(dataviz_area, data_, {
                xLabel: xFeature,
                yLabel: yFeature,
                width,
                height,
                fontSize: CONFIG.general.fontSize,
                zoomToFit: CONFIG.general.zoomToFit,
                //xType: CONFIG.general.xType,
                //yType: CONFIG.general.yType,
                seriesColors: CONFIG.general.seriesColor
            });
        } catch (error: unknown) {
            handleError('_Scatterplot', error);
        }
    }

    // Méthode pour afficher une Heatmap
    private static _Heatmap(
        dataviz_area: HTMLDivElement,
        data: Readonly<Array<Object>>,
        rowFeature: string,
        colFeature: string,
        valueFeature: string,
        height: number,
        width: number
    ): never | void {
        try {
            // Préparer les données pour la heatmap
            const { values, rowLabels, colLabels } = buildHeatmapData(data as Array<Object>, rowFeature, colFeature, valueFeature);

            // Rendu de la heatmap
            tfvis.render.heatmap(dataviz_area, { values, xTickLabels: rowLabels, yTickLabels: colLabels }, {
                xLabel: rowFeature,
                yLabel: colFeature,
                width,
                height,
                fontSize: CONFIG.general.fontSize,
                zoomToFit: CONFIG.general.zoomToFit,
                //xType: CONFIG.general.xType, 
                //yType: CONFIG.general.yType, 
                colorMap: CONFIG.heatmap.colorMap
            });
        } catch (error: unknown) {
            handleError('_Heatmap', error);
        }
    }

    // Méthode pour afficher un Histogram
    private static _Histogram(
        dataviz_area: HTMLDivElement,
        data: Readonly<Array<Object>>,
        xFeature: string,
        height: number,
        width: number
    ): never | void {
        try {
            // Extraire les valeurs numériques valides pour l'histogramme
            const data_ = data
                .map(datum => (datum as any)[xFeature])
                .filter(value => typeof value === 'number');

            // Rendu de l'histogramme
            tfvis.render.histogram(dataviz_area, data_, {
                xLabel: xFeature,
                yLabel: 'Frequency',
                width,
                height,
                fontSize: CONFIG.general.fontSize,
                zoomToFit: CONFIG.general.zoomToFit,
                //xType: CONFIG.general.xType,
                //yType: CONFIG.general.yType,
                maxBins: CONFIG.histogram.maxBins,
                color: CONFIG.general.color,
                stats: CONFIG.histogram.stats
            });
        } catch (error: unknown) {
            handleError('_Histogram', error);
        }
    }

    // Méthode pour afficher un tableau (Table)
    private static _Table(
        dataviz_area: HTMLDivElement,
        data: Readonly<Array<Object>>,
        features: Readonly<Array<string>>
    ): never | void {
        try {
            // Construire les headers pour le tableau (tous les features)
            const headers = features.map(feature => feature);

            // Construire les valeurs pour chaque ligne
            const values = data.map(datum =>
                features.map(feature => (datum as any)[feature] ?? 'N/A') // Valeur par défaut 'N/A' si manquante
            );

            // Rendu du tableau
            tfvis.render.table(dataviz_area, { headers, values }, {
                fontSize: CONFIG.general.fontSize
            });
        } catch (error: unknown) {
            handleError('_Table', error);
        }
    }
}
