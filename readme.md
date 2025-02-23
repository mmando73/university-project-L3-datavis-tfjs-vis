# Dataviz Module for DMN Project

This repository contains only the data visualization module (`Dataviz.ts`) that I developed as part of a larger [DMN-based project by my professor](https://github.com/Bab64/LiveDMN.com.ts). That original repository is **publicly available**, but the code here is **my own contribution** related to data visualization.

### Context
* **Main Project:** [Professor's DMN Project](https://github.com/Bab64/LiveDMN.com.ts) (public repository).
* **My Contribution:** This `Dataviz.ts` file is the module that handles:
    * Chart configuration and rendering (Line Chart, Bar Chart, Scatter Plot, Heatmap, Histogram, Table).
    * UI controls for filtering, sorting, aggregating, normalizing data, etc.
    * Integration with [TensorFlow.js Vis (tfvis)](https://js.tensorflow.org/api_vis/1.5.1/) to actually render the charts in the browser.

You will find more context about the overall DMN logic in the professor’s repository. This repo focuses on **my** data visualization code, which fits into that larger environment.

### Features
1. **Chart Selection**\
    Users can choose the type of chart (Line Chart, Bar Chart, Scatter Plot, Heatmap, Histogram, or Table).
2. **Data Processing**
    * Normalization of numeric columns.
    * Removal of outliers using an Interquartile Range (IQR)-based threshold.
    * Aggregation of data (sum, average, median, min, max).
3. **Filters**
    * Dynamic filtering UI allowing multiple filters on numeric or string columns.
    * Combined filters are applied in real-time.
4. **Sorting (for table)**
    * Allows sorting the displayed data by a chosen column in ascending or descending order.
5. **Integration with tfvis**
    * Each chart type is rendered using the corresponding `tfvis.render.*` method, with custom options for size, color, etc.
6. **Stateful Approach** 
    * Avoids recreating surfaces if they already exist to prevent duplication.
    * Maintains static references to surfaces, chart containers, and the dataset currently in use.

### How it works
1. **Setup**
    * `Dataviz.Setup(...)` is called from the main DMN code with the relevant data, feature list, and enumerations.
    * It checks if the UI controls (drop-downs, checkboxes, etc.) have already been created. If not, it creates them.

2. **User Interaction**
    * The user selects chart type, chooses columns, toggles filters, sets thresholds, etc.
    * Each change triggers `updateChart()`, which updates the displayed visualization.

3. **Rendering**
    * Charts are rendered in a dedicated `<div>` within the TF Visor panel.
    * The corresponding `_Linechart`, `_Barchart`, `_Scatterplot`, etc., methods handle the tfvis calls.

4. **tfviv quirks**
    * `tfvis.render.linechart` automatically indexes x-values from 0 to n-1 instead of using the x-values from the data points. A workaround is needed if you want truly custom x-values.
    * `tfvis.render.histogram` currently doesn’t allow custom labeling of axes.
    * The tfvis barchart might not re-render if the options are unchanged. I used a “dummy” parameter or timestamp in the options to force a refresh.

### Usage
1. **Clone Both Repos**
    * [Professor’s DMN Project](https://github.com/Bab64/LiveDMN.com.ts) for the main logic.
    * This Dataviz repo (copy the `Dataviz.ts` file + the `LiveDMN.css` file) into the same folder structure as the original.

2. **Compile**\
    Inside the main project folder, run:
    ```
    npm run build_frontend
    ```
    This will compile everything (including `Dataviz.ts`) into JavaScript.

3. **Serve**
    * Open `LiveDMN.com.html` via a local server (like the “Live Server” extension in VSCode, or simply a local dev server).
    * You should see the DMN interface, with an option to visualize charts through the TF Visor panel.

### License / Copyright
* **Professor’s Project**: See the [professor's repository](https://github.com/Bab64/LiveDMN.com.ts) for any licensing details related to the original codebase.
* **My Code**: I’m sharing my `Dataviz.ts` for educational/reference purposes, but the final usage depends on how the main project is licensed.


### Additional Notes
* **Just My Module**: ThisThis repo only provides `my` data visualization module. The original environment is required to see it in full action.
* **Contributions**: If you wish to extend or improve this code, feel free to open a discussion or PR in this repo. For the main DMN logic, refer to the professor’s repo.
* **Compilation**: Written in TypeScript for strong typing and clarity. NPM scripts handle the build.
* **Local Development**: After compiling, launch `LiveDMN.com.html` in your browser with a local server. You’ll see the DMN diagram plus the TF Visor with chart controls.

---

### Questions or Issues?
* Contact me for clarifications about the visualization code.
* For DMN logic or broader project details, please consult the [professor’s DMN repository](https://github.com/Bab64/LiveDMN.com.ts).

Happy coding!