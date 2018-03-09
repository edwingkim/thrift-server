import { zipkinMiddleware } from '@creditkarma/thrift-server-express'

import {
    createClient,
    ThriftContext,
    ZipkinTracePlugin,
} from '../main/'

import * as express from 'express'
import * as net from 'net'
import { CoreOptions } from 'request'

import {
    Calculator,
    Operation,
    Work,
} from './generated/calculator/calculator'

import {
    CALC_SERVER_CONFIG,
    CLIENT_CONFIG,
} from './config'

export function createClientServer(sampleRate: number = 0): Promise<net.Server> {
    // Get express instance
    const app = express()

    app.use(zipkinMiddleware({
        localServiceName: 'calculator-client',
        endpoint: 'http://localhost:9411/api/v1/spans',
        sampleRate,
    }))

    // Create thrift client
    const thriftClient: Calculator.Client<ThriftContext<CoreOptions>> =
        createClient(Calculator.Client, {
            hostName: CALC_SERVER_CONFIG.hostName,
            port: CALC_SERVER_CONFIG.port,
            register: [ ZipkinTracePlugin({
                localServiceName: 'calculator-client',
                remoteServiceName: 'calculator-service',
                endpoint: 'http://localhost:9411/api/v1/spans',
                sampleRate,
            }) ],
        })

    function symbolToOperation(sym: string): Operation {
        switch (sym) {
            case 'add':
                return Operation.ADD
            case 'subtract':
                return Operation.SUBTRACT
            case 'multiply':
                return Operation.MULTIPLY
            case 'divide':
                return Operation.DIVIDE
            default:
                throw new Error(`Unrecognized operation: ${sym}`)
        }
    }

    app.get('/ping', (req: express.Request, res: express.Response): void => {
        thriftClient.ping().then(() => {
            res.send('success')
        }, (err: any) => {
            console.log('err: ', err)
            res.status(500).send(err)
        })
    })

    app.get('/calculate', (req: express.Request, res: express.Response): void => {
        const work: Work = new Work({
            num1: req.query.left,
            num2: req.query.right,
            op: symbolToOperation(req.query.op),
        })

        thriftClient.calculate(1, work).then((val: number) => {
            res.send(`result: ${val}`)
        }, (err: any) => {
            res.status(500).send(err)
        })
    })

    return new Promise((resolve, reject) => {
        const server: net.Server = app.listen(CLIENT_CONFIG.port, () => {
            console.log(`Web server listening on port[${CLIENT_CONFIG.port}]`)
            resolve(server)
        })
    })
}