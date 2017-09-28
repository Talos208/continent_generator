const path = require('path');

module.exports = {
    entry: {
        javascript: './src/index.js',
    },
    output: {
        filename: 'index.bundle.js',
        path: path.resolve(__dirname, 'public')
    },
}