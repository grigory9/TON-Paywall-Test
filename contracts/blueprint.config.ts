import { Config } from '@ton/blueprint';

export const config: Config = {
    project: {
        type: 'tact',
        path: './contracts',
        output: './build',
    },
};
