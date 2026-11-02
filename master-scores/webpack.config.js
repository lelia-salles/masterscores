const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const defaultConfig = require('@wordpress/scripts/config/webpack.config');

module.exports = {
    ...defaultConfig,
    plugins: [
        ...defaultConfig.plugins,
        new CopyWebpackPlugin({
            patterns: [
                // Bravura font files. Depending on your VexFlow version, the
                // files may live in @vexflow-fonts/bravura or vexflow/build/.
                // noErrorOnMissing lets the build pass while you confirm.
                {
                    from: path.resolve(
                        __dirname,
                        'node_modules/@vexflow-fonts/bravura/bravura.woff2'
                    ),
                    to: 'fonts/bravura.woff2',
                    noErrorOnMissing: true,
                },
                {
                    from: path.resolve(
                        __dirname,
                        'node_modules/@vexflow-fonts/bravura/bravura.otf'
                    ),
                    to: 'fonts/bravura.otf',
                    noErrorOnMissing: true,
                },
                {
                    from: path.resolve(
                        __dirname,
                        'node_modules/@vexflow-fonts/academico/academico.woff2'
                    ),
                    to: 'fonts/academico.woff2',
                    noErrorOnMissing: true,
                },
                {
                    from: path.resolve(
                        __dirname,
                        'node_modules/@vexflow-fonts/academico/academico.otf'
                    ),
                    to: 'fonts/academico.otf',
                    noErrorOnMissing: true,
                },
            ],
        }),
    ],
};