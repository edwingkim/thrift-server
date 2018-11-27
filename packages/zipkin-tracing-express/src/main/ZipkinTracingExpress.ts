import {
    deepMerge,
    getProtocol,
    getTransport,
    IRequestHeaders,
    readThriftMethod,
} from '@creditkarma/thrift-server-core'

import {
    getTracerForService,
    headersForTraceId,
    IZipkinOptions,
    normalizeHeaders,
} from '@creditkarma/thrift-zipkin-core'

import { Instrumentation, option, TraceId, Tracer } from 'zipkin'

import * as express from 'express'
import * as url from 'url'

function formatRequestUrl(req: express.Request): string {
    const parsed = url.parse(req.originalUrl)
    return url.format({
        protocol: req.protocol,
        host: req.get('host'),
        pathname: parsed.pathname || '/',
        search: parsed.search,
    })
}

export function ZipkinTracingExpress({
    localServiceName,
    port = 0,
    transport = 'buffered',
    protocol = 'binary',
    tracerConfig = {},
}: IZipkinOptions): express.RequestHandler {
    const tracer: Tracer = getTracerForService(localServiceName, tracerConfig)
    const instrumentation = new Instrumentation.HttpServer({ tracer, port })

    return (
        request: express.Request,
        response: express.Response,
        next: express.NextFunction,
    ): void => {
        tracer.scoped(() => {
            const requestMethod: string = readThriftMethod(
                request.body,
                getTransport(transport),
                getProtocol(protocol),
            )
            const normalHeaders: IRequestHeaders = normalizeHeaders(
                request.headers,
            )

            function readHeader(
                header: string,
            ): option.IOption<string | Array<string>> {
                const val = normalHeaders[header.toLocaleLowerCase()]
                if (val !== null && val !== undefined) {
                    return new option.Some(val)
                } else {
                    return option.None
                }
            }

            const traceId: TraceId = instrumentation.recordRequest(
                requestMethod || request.method,
                formatRequestUrl(request),
                readHeader as any,
            )

            const traceHeaders: IRequestHeaders = headersForTraceId(traceId)

            const updatedHeaders: IRequestHeaders = deepMerge(
                normalHeaders,
                traceHeaders,
            )

            request.headers = updatedHeaders

            response.on('finish', () => {
                tracer.scoped(() => {
                    instrumentation.recordResponse(
                        traceId as any,
                        `${response.statusCode}`,
                    )
                })
            })

            next()
        })
    }
}