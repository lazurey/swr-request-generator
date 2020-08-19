import { generateClientName, generateFunctionName, generateRequestArguments, testJSON, toCapitalCase } from "../utils";
import { IResolvedPath } from "../types";

describe("#toCapitalCase", () => {
  it("when word is undefined, should return empty string", () => {
    expect(toCapitalCase()).toEqual("");
  });

  it("should transform word to capital case", () => {
    expect(toCapitalCase("helloWorld")).toEqual("HelloWorld");
  });
});

describe("#testJSON", () => {
  it("when inputs is a valid json string, should parse it and return correct json object", () => {
    expect(testJSON("{}")).toEqual({});
    expect(testJSON('["foo","bar",{"foo":"bar"}]')).toEqual(["foo", "bar", { foo: "bar" }]);
  });
  it("when inputs is not a string, should return nothing", () => {
    expect(testJSON(3)).toEqual(undefined);
    expect(testJSON(true)).toEqual(undefined);
    expect(testJSON({})).toEqual(undefined);
    expect(testJSON([])).toEqual(undefined);
  });
  it("when inputs is an invalid json string, should print error message", () => {
    const mockPrint = jest.fn();
    testJSON("{a: 1}", "some error", mockPrint);
    expect(mockPrint).toHaveBeenCalledWith("some error");
  });
});

describe("#generateRequestArguments", () => {
  const removeSpaces = (str: string) => str.replace(/[\n \r]/g, "");

  it("should return empty string when request argument is empty", () => {
    expect(generateRequestArguments(resolvedPath)).toBe("");
  });

  it("should return arg and it's corresponding type when request only one argument presents", () => {
    expect(
      removeSpaces(generateRequestArguments({ ...resolvedPath, pathParams: ["id"], TReq: { id: "string" } })),
    ).toBe("{id}:{'id':string;}");
  });

  it("should return arg and it's corresponding type with camelCase when request only one argument presents", () => {
    expect(
      removeSpaces(generateRequestArguments({ ...resolvedPath, bodyParams: ["BookController_createBookRequest"], TReq: { "BookController_createBookRequest": "ICreateBookRequest" } })),
    ).toBe("{bookControllerCreateBookRequest}:{'bookControllerCreateBookRequest':ICreateBookRequest;}");
  });

  it("should return args and it's corresponding types when multiple arguments present", () => {
    expect(
      removeSpaces(
        generateRequestArguments({
          ...resolvedPath,
          pathParams: ["id"],
          queryParams: ["name"],
          TReq: { id: "string", name: "string" },
        }),
      ),
    ).toBe("{id,name}:{'id':string;'name':string;}");
  });

  const resolvedPath = {
    TReq: undefined,
    pathParams: [""],
    queryParams: [""],
    bodyParams: [""],
    formDataParams: [""],
  } as IResolvedPath;
});

describe("#generateFunctionName", () => {
  it("should return expected method name for get request", () => {
    const operationId = "PersonController_findPersonById";
    expect(generateFunctionName("get", operationId)).toBe("personControllerFindPersonByIdRequest");
  });

  it("should return expected method name for other requests", () => {
    const operationId = "PersonController_findPersonById";
    expect(generateFunctionName("post", operationId)).toBe("createPersonControllerFindPersonByIdRequest");
    expect(generateFunctionName("put", operationId)).toBe("createPersonControllerFindPersonByIdRequest");
    expect(generateFunctionName("delete", operationId)).toBe("createPersonControllerFindPersonByIdRequest");
  });
});

describe("#generateClientName", () => {
  it("should return createRequestHook client given request method is get", () => {
    expect(generateClientName("get", "IResponse")).toBe("createRequestHook<IResponse, IResponseError>")
  });

  it("should return normal client given request method is others", () => {
    expect(generateClientName("post", "IResponse")).toBe("client.request<IResponse>")
    expect(generateClientName("put", "IResponse")).toBe("client.request<IResponse>")
    expect(generateClientName("delete", "IResponse")).toBe("client.request<IResponse>")
  });
});