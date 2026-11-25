const path = require("path");

module.exports = {
  target: "node", // Crucial for Node.js builds
  mode: "production", // or 'development'
  entry: "./app.js", // Your main application entry point
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js", // The bundled output file
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader", // If you need Babel for transpilation
          options: {
            presets: ["@babel/preset-env"],
          },
        },
      },
    ],
  },
  // Optional: Handle external modules to avoid bundling node_modules
  externals: [require("webpack-node-externals")()],
};
