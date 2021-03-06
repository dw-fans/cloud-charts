﻿'use strict';

/**
 * 说明: webpack的配置请在该文件进行修改
 * webpack配置文档请查看:https://webpack.github.io/docs/configuration.html
 */
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const webpack = require('webpack');
const glob = require('glob');
const FallbackPort = require('fallback-port');
const packageInfo = require('./package');

// 默认开启3000端口,若被占用,则开启其他端口
const fallbackPort = new FallbackPort(9009);

const componentName = 'CloudCharts';
const srcPath = path.resolve(__dirname, './components');
const demoPath = path.resolve(__dirname, './demo');
const outputPath = path.resolve(__dirname, './build');
const pluginPath = path.resolve(__dirname, './components/plugins');

const config = {
  // 服务器开启的端口号
  port: fallbackPort.getPort(),

  context: srcPath,

  mode: 'development',

  // webpack 编译的入口文件
  entry: {
    index: ['./index.scss', './index.jsx'],
  },

  // 输出的文件配置
  output: {
    path: outputPath,
    filename: '[name].js',
    publicPath: '/build/',
    // 设置library 则可以直接通过 window.xxx 访问到
    library: componentName,
    libraryTarget: 'umd'
  },

  resolve: {
    modules: [srcPath, 'node_modules'],
    extensions: ['.js', '.jsx'],
    alias: {
      '@alicloud/cloud-charts': srcPath,
      '@alicloud/cloud-charts/lib': srcPath,
      '@antv/data-set$': path.resolve(__dirname, './components/common/dataSet'),
      '@antv/data-set/lib': '@antv/data-set/lib'
    }
  },

  externals: [
    {
      'react': {
        root: 'React',
        commonjs2: 'react',
        commonjs: 'react',
        amd: 'react'
      },
      'react-dom': {
        root: 'ReactDOM',
        commonjs2: 'react-dom',
        commonjs: 'react-dom',
        amd: 'react-dom'
      },
    },
  ],

  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: ['babel-loader'],
      },
      {
        test: /\.scss$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
            options: {
              // you can specify a publicPath here
              // by default it uses publicPath in webpackOptions.output
              // publicPath: '../',
              hmr: process.env.NODE_ENV === 'development',
            },
          },
          'css-loader',
          'sass-loader'
        ],
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf|svg)((\?|#).*)?$/,
        use: [{
          loader: 'file-loader',
          options: {
            name: '[name].[ext]',
            publicPath: './',
          },
        }],
      },
    ]
  },

  plugins: [
    new MiniCssExtractPlugin({
      // Options similar to the same options in webpackOptions.output
      // both options are optional
      filename: '[name].css',
      // chunkFilename: '[id].css',
    }),
  ],

};


/**
 * 获取demo文件夹中的入口文件
 * @param cwd
 * @returns {{}}
 */
function getDevEntry(cwd) {
  const entry = {};
  glob.sync('*.jsx', {cwd}).forEach((item) => {
    const file = item.replace('.jsx', '');
    entry[file] = [
      // activate HMR for React
      'react-hot-loader/patch',
      `webpack-dev-server/client?http://0.0.0.0:${config.port}/`,
      'webpack/hot/only-dev-server',
      `${file}.scss`,
      item
    ];
  });
  return entry;
}

function getPlugins() {
  const entry = {};
  const plugins = fs.readdirSync(pluginPath);
  plugins.forEach(function (plugin) {
    var componentStat = fs.lstatSync(pluginPath + '/' + plugin);
    if (!componentStat.isDirectory()) {
      return;
    }

    entry[plugin] = './plugins/' + plugin + '/index.jsx';
  });
  return entry;
}

/**
 * 开发环境及demo编译时的配置
 * @returns {*}
 */
function dev() {
  const _config = _.cloneDeep(config);

  _config.context = demoPath;
  _config.resolve.modules = [demoPath, 'node_modules'];
  _config.output = {
    path: demoPath,
    filename: '[name].js',
    publicPath: '/demo/'
  };
  _config.externals[0].react = 'var React';
  _config.externals[0]['react-dom'] = 'var ReactDOM';

  _config.plugins.push(
    // 进度插件
    new webpack.ProgressPlugin((percentage, msg) => {
      const stream = process.stderr;
      if (stream.isTTY && percentage < 0.71) {
        stream.cursorTo(0);
        stream.write(`📦   ${msg}`);
        stream.clearLine(1);
      }
    }),

    new webpack.DefinePlugin({
      __VERSION__: JSON.stringify(packageInfo.version),
      __THEME__: JSON.stringify('index')
    }),

    // 代码热替换
    // new webpack.HotModuleReplacementPlugin(),
  );

  // 添加soure-map
  _config.devtool = 'source-map';
  // 入口文件添加server 和 hrm
  _config.entry = Object.assign(getDevEntry(demoPath), getDevEntry(srcPath));

  return _config;
}

/**
 * 发布到cdn及tnpm时的配置
 * @returns {*}
 */
function prod(themeName, isPlugin) {
  const _config = _.cloneDeep(config);

  _config.mode = 'production';

  _config.optimization = {
    minimizer: [
      new UglifyJsPlugin({
        uglifyOptions: {
          output: {
            comments: false,
          },
        },
      }),
      new OptimizeCSSAssetsPlugin({}),
    ],
  };

  // build环境
  if (themeName) {
    _config.entry = {
      [themeName]: _config.entry.index,
    };
  }

  if (isPlugin) {
    _config.entry = getPlugins();
    _config.output.library = componentName + '[name]';
    _config.externals[0]['@alicloud/cloud-charts'] = {
      root: componentName,
      commonjs2: '@alicloud/cloud-charts',
      commonjs: '@alicloud/cloud-charts',
      amd: '@alicloud/cloud-charts'
    };
  }

  _config.plugins.push(
    new webpack.DefinePlugin({
      __VERSION__: JSON.stringify(packageInfo.version),
      __THEME__: JSON.stringify(themeName || 'index')
    })
  );

  return _config;
}

/**
 * online 环境
 * @returns {*}
 */
function online(themeName, isPlugin) {
  const _config = _.cloneDeep(config);

  if (themeName) {
    _config.entry = {
      [themeName]: _config.entry.index,
    };
  }

  if (isPlugin) {
    _config.entry = getPlugins();
    _config.output.library = componentName + '[name]';
    _config.externals[0]['@alicloud/cloud-charts'] = {
      root: componentName,
      commonjs2: '@alicloud/cloud-charts',
      commonjs: '@alicloud/cloud-charts',
      amd: '@alicloud/cloud-charts'
    };
  }

  _config.plugins.push(
    // 进度插件
    new webpack.ProgressPlugin((percentage, msg) => {
      const stream = process.stderr;
      if (stream.isTTY && percentage < 0.71) {
        stream.cursorTo(0);
        stream.write(`📦   ${msg}`);
        stream.clearLine(1);
      }
    }),

    new webpack.DefinePlugin({
      __VERSION__: JSON.stringify(packageInfo.version),
      __THEME__: JSON.stringify('index')
    })
  );

  // 添加soure-map
  _config.devtool = 'source-map';

  return _config;
}

module.exports = {

  dev,

  // demo,

  prod,

  online,

  srcPath

};
