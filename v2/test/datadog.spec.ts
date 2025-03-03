import { App, Stack, Token } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { addCdkConstructVersionTag, checkForMultipleApiKeys, Datadog, DD_HANDLER_ENV_VAR } from "../src/index";
const { ISecret } = require("aws-cdk-lib/aws-secretsmanager");
const versionJson = require("../version.json");
const EXTENSION_LAYER_VERSION = 5;
const NODE_LAYER_VERSION = 91;
const PYTHON_LAYER_VERSION = 73;

describe("validateProps", () => {
  it("throws an error when the site is set to an invalid site URL", () => {
    const app = new App();
    const stack = new Stack(app, "stack", {
      env: {
        region: "sa-east-1",
      },
    });
    const hello = new lambda.Function(stack, "HelloHandler", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });
    let threwError = false;
    let thrownError: Error | undefined;
    try {
      const datadogCdk = new Datadog(stack, "Datadog", {
        nodeLayerVersion: NODE_LAYER_VERSION,
        extensionLayerVersion: EXTENSION_LAYER_VERSION,
        apiKey: "1234",
        enableDatadogTracing: false,
        flushMetricsToLogs: false,
        site: "dataDOGEhq.com",
      });
      datadogCdk.addLambdaFunctions([hello]);
    } catch (e) {
      threwError = true;
      if (e instanceof Error) {
        thrownError = e;
      }
    }
    expect(threwError).toBe(true);
    expect(thrownError?.message).toEqual(
      "Warning: Invalid site URL. Must be either datadoghq.com, datadoghq.eu, us3.datadoghq.com, us5.datadoghq.com, ap1.datadoghq.com, or ddog-gov.com.",
    );
  });

  it("doesn't throw an error when the site is invalid and DD_CDK_BYPASS_SITE_VALIDATION is true", () => {
    process.env.DD_CDK_BYPASS_SITE_VALIDATION = "true";
    const app = new App();
    const stack = new Stack(app, "stack", {
      env: {
        region: "sa-east-1",
      },
    });
    const hello = new lambda.Function(stack, "HelloHandler", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });
    let threwError = false;
    let thrownError: Error | undefined;
    try {
      const datadogCdk = new Datadog(stack, "Datadog", {
        nodeLayerVersion: NODE_LAYER_VERSION,
        extensionLayerVersion: EXTENSION_LAYER_VERSION,
        apiKey: "1234",
        enableDatadogTracing: false,
        flushMetricsToLogs: false,
        site: "dataDOGEhq.com",
      });
      datadogCdk.addLambdaFunctions([hello]);
    } catch (e) {
      threwError = true;
      if (e instanceof Error) {
        thrownError = e;
      }
    }
    expect(threwError).toBe(false);
    expect(thrownError?.message).toEqual(undefined);
    process.env.DD_CDK_BYPASS_SITE_VALIDATION = undefined;
  });

  it("doesn't throw an error when the site is set as a cdk token", () => {
    const app = new App();
    const stack = new Stack(app, "stack", {
      env: {
        region: "sa-east-1",
      },
    });
    const hello = new lambda.Function(stack, "HelloHandler", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });
    let threwError = false;
    let thrownError: Error | undefined;
    const datadogSite = "${Token[TOKEN.100]}" as Token;
    try {
      const datadogCdk = new Datadog(stack, "Datadog", {
        nodeLayerVersion: NODE_LAYER_VERSION,
        extensionLayerVersion: EXTENSION_LAYER_VERSION,
        apiKey: "1234",
        enableDatadogTracing: false,
        flushMetricsToLogs: false,
        site: `${datadogSite}`,
      });
      datadogCdk.addLambdaFunctions([hello]);
    } catch (e) {
      threwError = true;
      if (e instanceof Error) {
        thrownError = e;
      }
    }
    expect(threwError).toBe(false);
    expect(thrownError?.message).toEqual(undefined);
  });

  it("doesn't throw an error if an apiKeySecret is set", () => {
    const app = new App();
    const stack = new Stack(app, "stack");
    const hello = new lambda.Function(stack, "HelloHandler", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });

    const secret: typeof ISecret = {
      secretArn: "dummy-arn",
      grantRead() {
        return;
      },
    };

    let threwError = false;
    let thrownError: Error | undefined;
    try {
      const datadogCdk = new Datadog(stack, "Datadog", {
        nodeLayerVersion: NODE_LAYER_VERSION,
        extensionLayerVersion: EXTENSION_LAYER_VERSION,
        apiKeySecret: secret,
        enableDatadogTracing: false,
        flushMetricsToLogs: false,
      });
      datadogCdk.addLambdaFunctions([hello]);
    } catch (e) {
      threwError = true;
      if (e instanceof Error) {
        thrownError = e;
      }
    }
    expect(threwError).toBe(false);
    expect(thrownError?.message).toEqual(undefined);
  });

  it("throws error if flushMetricsToLogs is false and both API key and KMS API key are undefined", () => {
    const app = new App();
    const stack = new Stack(app, "stack", {
      env: {
        region: "us-west-2",
      },
    });
    const hello = new lambda.Function(stack, "HelloHandler", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });
    expect(() => {
      const datadogCDK = new Datadog(stack, "Datadog", {
        forwarderArn: "forwarder-arn",
        flushMetricsToLogs: false,
        site: "datadoghq.com",
      });
      datadogCDK.addLambdaFunctions([hello]);
    }).toThrowError(
      "When `flushMetricsToLogs` is false, `apiKey`, `apiKeySecretArn`, or `apiKmsKey` must also be set.",
    );
  });

  it("throws an error when the `extensionLayerVersion` is set and neither the `apiKey` nor `apiKmsKey` is set", () => {
    const app = new App();
    const stack = new Stack(app, "stack", {
      env: {
        region: "sa-east-1",
      },
    });
    const hello = new lambda.Function(stack, "HelloHandler", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });
    let threwError = false;
    let thrownError: Error | undefined;
    try {
      const datadogCdk = new Datadog(stack, "Datadog", {
        nodeLayerVersion: NODE_LAYER_VERSION,
        extensionLayerVersion: EXTENSION_LAYER_VERSION,
        addLayers: true,
        enableDatadogTracing: false,
        flushMetricsToLogs: true,
        site: "datadoghq.com",
      });
      datadogCdk.addLambdaFunctions([hello]);
    } catch (e) {
      threwError = true;
      if (e instanceof Error) {
        thrownError = e;
      }
    }
    expect(threwError).toBe(true);
    expect(thrownError?.message).toEqual(
      "When `extensionLayer` is set, `apiKey`, `apiKeySecretArn`, or `apiKmsKey` must also be set.",
    );
  });

  it("throws an error if enableDatadogASM is enabled and enableDatadogTracing is not", () => {
    const app = new App();
    const stack = new Stack(app, "stack", {
      env: {
        region: "sa-east-1",
      },
    });
    expect(
      () =>
        new Datadog(stack, "Datadog", {
          enableDatadogTracing: false,
          enableDatadogASM: true,
        }),
    ).toThrow("When `enableDatadogASM` is enabled, `enableDatadogTracing` must also be enabled.");
  });
});

describe("addCdkConstructVersionTag", () => {
  it("adds the dd_cdk_construct tag to all lambda function", () => {
    const app = new App();
    const stack = new Stack(app, "stack", {
      env: {
        region: "sa-east-1",
      },
    });
    const hello1 = new lambda.Function(stack, "HelloHandler1", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });
    const hello2 = new lambda.Function(stack, "HelloHandler2", {
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });
    addCdkConstructVersionTag([hello1, hello2]);
    Template.fromStack(stack).hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs16.x",
      Tags: [
        {
          Key: "dd_cdk_construct",
          Value: `v${versionJson.version}`,
        },
      ],
    });
    Template.fromStack(stack).hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "python3.8",
      Tags: [
        {
          Key: "dd_cdk_construct",
          Value: `v${versionJson.version}`,
        },
      ],
    });
  });
  it("Does not call the addForwarder function when the extension is enabled", () => {
    const app = new App();
    const stack = new Stack(app, "stack", {
      env: {
        region: "sa-east-1",
      },
    });
    const hello1 = new lambda.Function(stack, "HelloHandler1", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });

    const datadogCdk = new Datadog(stack, "Datadog", {
      nodeLayerVersion: NODE_LAYER_VERSION,
      extensionLayerVersion: EXTENSION_LAYER_VERSION,
      addLayers: true,
      enableDatadogTracing: false,
      flushMetricsToLogs: true,
      site: "datadoghq.com",
      forwarderArn: "forwarder-arn",
      apiKey: "1234",
    });

    datadogCdk.addLambdaFunctions([hello1]);
    Template.fromStack(stack).resourceCountIs("AWS::Logs::SubscriptionFilter", 0);
  });

  it("Does call the addForwarderToNonLambdaLogGrpoups function when the extension is enabled", () => {
    const app = new App();
    const stack = new Stack(app, "stack", {
      env: {
        region: "sa-east-1",
      },
    });

    const helloLogGroup = new LogGroup(stack, "helloLogGroup");

    const datadogCdk = new Datadog(stack, "Datadog", {
      nodeLayerVersion: NODE_LAYER_VERSION,
      extensionLayerVersion: EXTENSION_LAYER_VERSION,
      addLayers: true,
      enableDatadogTracing: false,
      flushMetricsToLogs: true,
      site: "datadoghq.com",
      forwarderArn: "arn:test:forwarder:sa-east-1:12345678:1",
      apiKey: "1234",
    });

    datadogCdk.addForwarderToNonLambdaLogGroups([helloLogGroup]);

    Template.fromStack(stack).resourceCountIs("AWS::Logs::SubscriptionFilter", 1);
  });
});

describe("checkForMultipleApiKeys", () => {
  it("throws error if both API key and KMS API key are defined", () => {
    expect(() => {
      checkForMultipleApiKeys({
        apiKey: "1234",
        apiKmsKey: "5678",
      });
    }).toThrowError("`apiKey` and `apiKmsKey` should not be set at the same time.");
  });

  it("throws error if both API key and API key secret ARN are defined", () => {
    expect(() => {
      checkForMultipleApiKeys({
        apiKey: "1234",
        apiKeySecretArn: "some-resource:from:aws:secrets-manager:arn",
      });
    }).toThrowError("`apiKey` and `apiKeySecretArn` should not be set at the same time.");
  });

  it("throws error if both API key secret ARN and KMS API key are defined", () => {
    expect(() => {
      checkForMultipleApiKeys({
        apiKeySecretArn: "some-resource:from:aws:secrets-manager:arn",
        apiKmsKey: "5678",
      });
    }).toThrowError("`apiKmsKey` and `apiKeySecretArn` should not be set at the same time.");
  });

  it("throws error if both API key secret ARN and KMS API key are defined", () => {
    expect(() => {
      checkForMultipleApiKeys({
        apiKey: "1234",
        apiKeySecretArn: "some-resource:from:aws:secrets-manager:arn",
        apiKmsKey: "5678",
      });
    }).toThrowError("`apiKey`, `apiKmsKey`, and `apiKeySecretArn` should not be set at the same time.");
  });
});

describe("setTags", () => {
  it("adds tags when forwarder is set", () => {
    const app = new App();
    const stack = new Stack(app, "stack", {
      env: {
        region: "sa-east-1",
      },
    });
    const hello1 = new lambda.Function(stack, "HelloHandler1", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });
    const hello2 = new lambda.Function(stack, "HelloHandler2", {
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });

    const datadogCdk = new Datadog(stack, "Datadog", {
      nodeLayerVersion: NODE_LAYER_VERSION,
      pythonLayerVersion: PYTHON_LAYER_VERSION,
      extensionLayerVersion: EXTENSION_LAYER_VERSION,
      addLayers: true,
      enableDatadogTracing: false,
      flushMetricsToLogs: true,
      site: "datadoghq.com",
      forwarderArn: "arn:test:forwarder:sa-east-1:12345678:1",
      apiKey: "1234",
      env: "test-env",
      service: "test-service",
      version: "1",
      tags: "team:avengers,project:marvel",
    });
    datadogCdk.addLambdaFunctions([hello1, hello2]);

    Template.fromStack(stack).hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs16.x",
      Tags: [
        {
          Key: "dd_cdk_construct",
          Value: `v${versionJson.version}`,
        },
        {
          Key: "env",
          Value: "test-env",
        },
        {
          Key: "project",
          Value: "marvel",
        },
        {
          Key: "service",
          Value: "test-service",
        },
        {
          Key: "team",
          Value: "avengers",
        },
        {
          Key: "version",
          Value: "1",
        },
      ],
    });
    Template.fromStack(stack).hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "python3.8",
      Tags: [
        {
          Key: "dd_cdk_construct",
          Value: `v${versionJson.version}`,
        },
        {
          Key: "env",
          Value: "test-env",
        },
        {
          Key: "project",
          Value: "marvel",
        },
        {
          Key: "service",
          Value: "test-service",
        },
        {
          Key: "team",
          Value: "avengers",
        },
        {
          Key: "version",
          Value: "1",
        },
      ],
    });
  });
  it("does not add tags when forwarder isn't set", () => {
    const app = new App();
    const stack = new Stack(app, "stack", {
      env: {
        region: "sa-east-1",
      },
    });
    const hello1 = new lambda.Function(stack, "HelloHandler1", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });
    const hello2 = new lambda.Function(stack, "HelloHandler2", {
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });

    const datadogCdk = new Datadog(stack, "Datadog", {
      nodeLayerVersion: NODE_LAYER_VERSION,
      pythonLayerVersion: PYTHON_LAYER_VERSION,
      extensionLayerVersion: EXTENSION_LAYER_VERSION,
      addLayers: true,
      enableDatadogTracing: false,
      flushMetricsToLogs: true,
      site: "datadoghq.com",
      apiKey: "1234",
      env: "test-env",
      service: "test-service",
      version: "1",
      tags: "team:avengers,project:marvel",
    });
    datadogCdk.addLambdaFunctions([hello1, hello2]);

    Template.fromStack(stack).hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs16.x",
      Tags: [
        {
          Key: "dd_cdk_construct",
          Value: `v${versionJson.version}`,
        },
      ],
    });
    Template.fromStack(stack).hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "python3.8",
      Tags: [
        {
          Key: "dd_cdk_construct",
          Value: `v${versionJson.version}`,
        },
      ],
    });
  });
});

describe("apiKeySecret", () => {
  it("sets apiKeySecretArn", () => {
    const app = new App();
    const stack = new Stack(app, "stack");
    const hello = new lambda.Function(stack, "HelloHandler", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });
    const secret: typeof ISecret = {
      secretArn: "dummy-arn",
      grantRead() {
        return;
      },
    };
    const datadogCdk = new Datadog(stack, "Datadog", {
      nodeLayerVersion: NODE_LAYER_VERSION,
      extensionLayerVersion: EXTENSION_LAYER_VERSION,
      apiKeySecret: secret,
      enableDatadogTracing: false,
      flushMetricsToLogs: false,
    });
    datadogCdk.addLambdaFunctions([hello]);
    expect(datadogCdk.transport.apiKeySecretArn).toEqual("dummy-arn");
  });
  it("overrides apiKeySecretArn", () => {
    const app = new App();
    const stack = new Stack(app, "stack");
    const hello = new lambda.Function(stack, "HelloHandler", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });
    const secret: typeof ISecret = {
      secretArn: "arn:aws:secretsmanager:sa-east-1:123:secret:test-key-from-isecret",
      grantRead() {
        return;
      },
    };
    const datadogCdk = new Datadog(stack, "Datadog", {
      nodeLayerVersion: NODE_LAYER_VERSION,
      extensionLayerVersion: EXTENSION_LAYER_VERSION,
      apiKeySecret: secret,
      apiKeySecretArn: "arn:aws:secretsmanager:sa-east-1:123:secret:test-key",
      enableDatadogTracing: false,
      flushMetricsToLogs: false,
    });
    datadogCdk.addLambdaFunctions([hello]);
    expect(datadogCdk.transport.apiKeySecretArn).toEqual(
      "arn:aws:secretsmanager:sa-east-1:123:secret:test-key-from-isecret",
    );
  });
});

describe("addLambdaFunctions", () => {
  it("automatically gives lambdas secret read access to the given apiKeySecretArn by default", () => {
    const app = new App();
    const stack = new Stack(app, "stack");
    const hello = new lambda.Function(stack, "HelloHandler", {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });
    const datadogCdk = new Datadog(stack, "Datadog", {
      nodeLayerVersion: NODE_LAYER_VERSION,
      extensionLayerVersion: EXTENSION_LAYER_VERSION,
      apiKeySecretArn: "arn:aws:secretsmanager:sa-east-1:123:secret:test-key",
      enableDatadogTracing: false,
      flushMetricsToLogs: false,
      logLevel: "debug",
    });
    datadogCdk.addLambdaFunctions([hello], stack);
    Template.fromStack(stack).hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: [
          {
            Action: ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
            Resource: "arn:aws:secretsmanager:sa-east-1:123:secret:test-key-??????",
          },
        ],
      },
    });
  });
  it("doesn't give lambdas secret read access to the given apiKeySecretArn if grantSecretReadAccess is false", () => {
    const app = new App();
    const stack = new Stack(app, "stack");
    const hello = new lambda.Function(stack, "HelloHandler", {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });
    const datadogCdk = new Datadog(stack, "Datadog", {
      nodeLayerVersion: NODE_LAYER_VERSION,
      extensionLayerVersion: EXTENSION_LAYER_VERSION,
      apiKeySecretArn: "arn:aws:secretsmanager:sa-east-1:123:secret:test-key",
      enableDatadogTracing: false,
      flushMetricsToLogs: false,
      logLevel: "debug",
      grantSecretReadAccess: false,
    });
    datadogCdk.addLambdaFunctions([hello], stack);
    Template.fromStack(stack).resourceCountIs("AWS::IAM::Policy", 0);
  });
});

describe("redirectHandler", () => {
  it("doesn't redirect handler when explicitly set to `false`", () => {
    const app = new App();
    const stack = new Stack(app, "stack", {
      env: {
        region: "us-west-2",
      },
    });
    const hello = new lambda.Function(stack, "HelloHandler", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });
    const datadogCDK = new Datadog(stack, "Datadog", {
      redirectHandler: false,
      nodeLayerVersion: NODE_LAYER_VERSION,
    });
    datadogCDK.addLambdaFunctions([hello]);

    Template.fromStack(stack).hasResourceProperties("AWS::Lambda::Function", {
      Handler: "hello.handler",
    });
  });

  it("redirects handler by default", () => {
    const app = new App();
    const stack = new Stack(app, "stack", {
      env: {
        region: "us-west-2",
      },
    });
    const hello = new lambda.Function(stack, "HelloHandler", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromInline("test"),
      handler: "hello.handler",
    });
    const datadogCDK = new Datadog(stack, "Datadog", { nodeLayerVersion: NODE_LAYER_VERSION });
    datadogCDK.addLambdaFunctions([hello]);

    Template.fromStack(stack).hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: {
          [DD_HANDLER_ENV_VAR]: "hello.handler",
        },
      },
    });
  });
});
