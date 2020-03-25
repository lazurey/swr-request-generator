import {
  Operation,
  Parameter,
  Path,
  Paths,
  Reference,
  RequestBody,
  Response,
  Schema,
  Server,
} from "@openapi-integration/openapi-schema";
import { SchemaResolver } from "./SchemaResolver";
import { generateEnums } from "./DefinitionsResolver";
import { chain, Dictionary, drop, filter, get, has, isEmpty, map, pick, reduce, sortBy, values } from "lodash";
import { toTypes } from "./utils";
import { HTTP_METHODS, SLASH } from "./constants";

// TODO: Should handle `deprecated` and `security` in Operation?

type IResolvedPath = IParameters & {
  url: string;
  method: string;
  TResp: any;
  TReq: any;
  operationId?: string;
};

interface IParameters {
  pathParams: Parameter[];
  queryParams: Parameter[];
  bodyParams: Parameter[];
  formDataParams: Parameter[];
}

export class PathResolver {
  resolvedPaths: IResolvedPath[] = [];
  extraDefinitions = {};

  static of(paths: Paths, servers: Server[] = []) {
    return new PathResolver(paths, servers);
  }

  constructor(private paths: Paths, private servers: Server[]) {}

  resolve = () => {
    this.resolvedPaths = reduce(
      this.paths,
      (results: IResolvedPath[], path: Path, pathName: string) => [...results, ...this.resolvePath(path, pathName)],
      [],
    );
    return this;
  };

  toRequest = (): string[] => {
    const data = sortBy(this.resolvedPaths, (o) => o.operationId);
    const requests = data.map((resolvedPath: IResolvedPath) => {
      const TReq = !isEmpty(resolvedPath.TReq) ? toTypes(resolvedPath.TReq) : undefined;
      const requestParamList = [
        ...resolvedPath.pathParams,
        ...resolvedPath.queryParams,
        ...resolvedPath.bodyParams,
        ...resolvedPath.formDataParams,
      ];
      const bodyData = get(resolvedPath.bodyParams, "[0]");
      const cookie = get(resolvedPath.formDataParams, "[0]");
      const body = bodyData || cookie;
      const params = this.toRequestParams(get(resolvedPath, "queryParams"));

      return `export const ${resolvedPath.operationId} = createRequestAction<${TReq}, ${resolvedPath.TResp}>('${
        resolvedPath.operationId
      }', (${!isEmpty(requestParamList) ? `${this.toRequestParams(requestParamList)}` : ""}) => ({url: \`${
        resolvedPath.url
      }\`, method: "${resolvedPath.method}", ${body ? `data: ${body},` : ""}${params ? `params: ${params},` : ""}${
        body ? `headers: {'Content-Type': ${cookie ? "'multipart/form-data'" : "'application/json'"}}` : ""
      }}));`;
    });

    const enums = Object.keys(this.extraDefinitions).map((k) => generateEnums(this.extraDefinitions, k));
    return [...requests, ...enums];
  };

  toRequestParams = (data: any[] = []) =>
    !isEmpty(data)
      ? `{
    ${data.join(",\n")}
    }`
      : undefined;

  resolvePath(path: Path, pathName: string) {
    const operations = pick(path, HTTP_METHODS);

    // TODO: need to do refactor
    const basePath = this.getBasePath();

    return Object.keys(operations).map((httpMethod) => {
      const requestPath = this.getRequestURL(pathName);

      return {
        url: `${basePath}${requestPath === SLASH && !!basePath ? "" : requestPath}`,
        method: httpMethod,
        ...this.resolveOperation((operations as Dictionary<any>)[httpMethod]),
      };
    });
  }

  getBasePath() {
    const basePath = SLASH.concat(drop(this.servers[0].url.split(SLASH), 3).join(SLASH));

    return basePath === SLASH ? "" : basePath;
  }

  getRequestURL = (pathName: string) => {
    return chain(pathName)
      .split(SLASH)
      .map((p) => (this.isPathParam(p) ? `$${p}` : p))
      .join(SLASH)
      .value();
  };

  isPathParam = (str: string) => str.startsWith("{");

  // TODO: handle the case when v.parameters = Reference
  resolveOperation = (operation: Operation) => {
    const pickParamsByType = this.pickParams(operation.parameters as Parameter[]);
    const params = {
      pathParams: pickParamsByType("path"),
      queryParams: pickParamsByType("query"),
      bodyParams: pickParamsByType("body"),
      formDataParams: pickParamsByType("cookie"),
    };

    return {
      operationId: operation.operationId,
      TResp: this.getResponseTypes(operation.responses),
      TReq: this.getRequestTypes(params, operation.operationId as string, get(operation, "requestBody")),
      ...this.getParamsNames(params),
    };
  };

  getParamsNames = (params: IParameters) => {
    const getNames = (list: any[]) => (isEmpty(list) ? [] : map(list, (item) => item.name));
    return {
      pathParams: getNames(params.pathParams),
      queryParams: getNames(params.queryParams),
      bodyParams: getNames(params.bodyParams),
      formDataParams: getNames(params.formDataParams),
    };
  };

  isNotReference = (value: any): value is Schema => !has(value, "$ref");

  getRequestTypes = (params: IParameters, operationId: string, requestBody?: RequestBody | Reference) => ({
    ...this.getPathParamsTypes(params.pathParams),
    ...this.getBodyAndQueryParamsTypes(params.bodyParams),
    ...this.getBodyAndQueryParamsTypes(params.queryParams),
    ...this.getFormDataParamsTypes(params.formDataParams),
    ...this.getRequestBodyTypes(operationId, requestBody),
  });

  getPathParamsTypes = (pathParams: Parameter[]) =>
    pathParams.reduce((results, param) => {
      const schema = get(param, "schema");

      if (this.isNotReference(schema)) {
        return {
          ...results,
          [`${param.name}${param.required ? "" : "?"}`]: schema.type === "integer" ? "number" : schema.type,
        };
      }

      return {
        ...results,
      };
    }, {});

  getBodyAndQueryParamsTypes = (bodyParams: Parameter[]) =>
    bodyParams.reduce(
      (results, param) => ({
        ...results,
        [`${param.name}${param.required ? "" : "?"}`]: SchemaResolver.of({
          results: this.extraDefinitions,
          schema: param.schema,
          key: param.name,
          parentKey: param.name,
        }).resolve(),
      }),
      {},
    );

  // TODO: handle other params here?
  getFormDataParamsTypes = (formDataParams: any[]) => {
    return formDataParams.reduce((results, param) => {
      if (param.schema) {
        return {
          ...results,
          [`${param.name}${param.required ? "" : "?"}`]: SchemaResolver.of({
            results: this.extraDefinitions,
            schema: param.schema,
            key: param.name,
            parentKey: param.name,
          }).resolve(),
        };
      }
      return {
        ...results,
        [`${param.name}${param.required ? "" : "?"}`]: param.type === "file" ? "File" : param.type,
      };
    }, {});
  };

  // TODO: handle Response or Reference
  getResponseTypes = (responses: { [responseName: string]: Response | Reference }) =>
    SchemaResolver.of({
      results: this.extraDefinitions,
      // TODO: handle other content type here
      schema:
        get(responses, "200.content.application/json.schema") ||
        get(responses, "200.content.*/*.schema") ||
        get(responses, "201.content.application/json.schema"),
    }).resolve();

  // TODO: when parameters has enum
  pickParams = (parameters: Parameter[]) => (type: "path" | "query" | "body" | "cookie") =>
    filter(parameters, (param) => param.in === type);

  getRequestBodyTypes(operationId: string, requestBody?: RequestBody | Reference) {
    if (this.isNotReference(requestBody)) {
      return reduce(
        values(requestBody?.content),
        (results, content) => ({
          ...results,
          [`${operationId}Request`]: SchemaResolver.of({
            results: this.extraDefinitions,
            schema: content.schema,
            key: `${operationId}Request`,
            parentKey: `${operationId}Request`,
          }).resolve(),
        }),
        {},
      );
    }

    return {
      [`${operationId}Request`]: SchemaResolver.of({
        results: this.extraDefinitions,
        schema: requestBody as Schema,
        key: `${operationId}Request`,
        parentKey: `${operationId}Request`,
      }).resolve(),
    };
  }
}
