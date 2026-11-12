const WatchExternalFilesPlugin = require('webpack-watch-files-plugin').default;
const Tasks = require('./scripts/tasks');
module.exports = env => {
  return {
    entry: {
      main: './src/index.js',
      viewer3d: './src/viewer3d/index.js'
    },
    module: {
      rules: [{
          test: /\.(js)$/,
          exclude: /node_modules/,
          use: ['babel-loader']
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"]
        },
        {
          test: /\.scss$/,
          use: ["style-loader", "css-loader", "sass-loader"]
        },
        {
          test: /\.html$/i,
          loader: 'html-loader',
          options: {
            esModule: true
          }
        },
        {
          test: /\.svg$/,
          loader: 'svg-inline-loader'
        }
      ]
    },
    resolve: {
      extensions: ['*', '.js']
    },
    output: {
      path: __dirname + '/build',
      publicPath: '/',
      filename: '[name].js'
    },
    plugins: [
      new WatchExternalFilesPlugin({
        files: [
          './src/**/*.json',
          './src/**/*.txt'
        ]
      }),
      {
        apply: (compiler) => {
          compiler.hooks.afterEmit.tap('AfterEmitPlugin', (compilation) => {
            if (env.LIVE_RELOAD === 'yes') {
              Tasks.buildWithLiveReload();
            } else {
              Tasks.build();
            }
          });
        }
      }
    ]
  };

};