/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2021 Datadog, Inc.
 */

import * as crypto from "crypto";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Architecture } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import log from "loglevel";
import {
  runtimeLookup,
  RuntimeType,
  runtimeToLayerName,
  govCloudRegions,
  DD_GOV_ACCOUNT_ID,
  DD_ACCOUNT_ID,
  LAYER_PREFIX,
  EXTENSION_LAYER_PREFIX,
} from "./index";

const layers: Map<string, lambda.ILayerVersion> = new Map();

export function applyLayers(
  scope: Construct,
  region: string,
  lambdas: lambda.Function[],
  pythonLayerVersion?: number,
  nodeLayerVersion?: number,
  javaLayerVersion?: number,
  dotnetLayerVersion?: number,
  extensionLayerVersion?: number,
  useLayersFromAccount?: string,
) {
  // TODO: check region availability
  const errors: string[] = [];
  log.debug("Applying layers to Lambda functions...");
  lambdas.forEach((lam) => {
    const runtime: string = lam.runtime.name;
    const lambdaRuntimeType: RuntimeType = runtimeLookup[runtime];
    const isARM =
      lam.architecture?.dockerPlatform !== undefined &&
      lam.architecture.dockerPlatform === Architecture.ARM_64.dockerPlatform;

    if (lambdaRuntimeType === undefined || lambdaRuntimeType === RuntimeType.UNSUPPORTED) {
      log.debug(`Unsupported runtime: ${runtime}`);
      return;
    }

    const accountId = useLayersFromAccount;
    let lambdaLayerArn;
    let extensionLayerArn;
    if (lambdaRuntimeType === RuntimeType.PYTHON) {
      if (pythonLayerVersion === undefined) {
        const errorMessage = getMissingLayerVersionErrorMsg(lam.node.id, "Python", "python");
        log.error(errorMessage);
        errors.push(errorMessage);
        return;
      }
      lambdaLayerArn = getLambdaLayerArn(region, pythonLayerVersion, runtime, isARM, false, accountId);
      log.debug(`Using Python Lambda layer: ${lambdaLayerArn}`);
      addLayer(lambdaLayerArn, false, scope, lam, runtime);
    }

    if (lambdaRuntimeType === RuntimeType.NODE) {
      if (nodeLayerVersion === undefined) {
        const errorMessage = getMissingLayerVersionErrorMsg(lam.node.id, "Node.js", "node");
        log.error(errorMessage);
        errors.push(errorMessage);
        return;
      }
      lambdaLayerArn = getLambdaLayerArn(region, nodeLayerVersion, runtime, isARM, true, accountId);
      log.debug(`Using Node Lambda layer: ${lambdaLayerArn}`);
      addLayer(lambdaLayerArn, false, scope, lam, runtime);
    }

    if (lambdaRuntimeType === RuntimeType.JAVA) {
      if (javaLayerVersion === undefined) {
        const errorMessage = getMissingLayerVersionErrorMsg(lam.node.id, "Java", "java");
        log.error(errorMessage);
        errors.push(errorMessage);
        return;
      }
      lambdaLayerArn = getLambdaLayerArn(region, javaLayerVersion, runtime, isARM, false, accountId);
      log.debug(`Using dd-trace-java layer: ${lambdaLayerArn}`);
      addLayer(lambdaLayerArn, false, scope, lam, runtime);
    }

    if (lambdaRuntimeType === RuntimeType.DOTNET) {
      if (dotnetLayerVersion === undefined) {
        const errorMessage = getMissingLayerVersionErrorMsg(lam.node.id, ".NET", "dotnet");
        log.error(errorMessage);
        errors.push(errorMessage);
        return;
      }
      lambdaLayerArn = getLambdaLayerArn(region, dotnetLayerVersion, runtime, isARM, false, accountId);
      log.debug(`Using dd-trace-dotnet layer: ${lambdaLayerArn}`);
      addLayer(lambdaLayerArn, false, scope, lam, runtime);
    }

    if (extensionLayerVersion !== undefined) {
      extensionLayerArn = getExtensionLayerArn(region, extensionLayerVersion, isARM, accountId);
      log.debug(`Using extension layer: ${extensionLayerArn}`);
      addLayer(extensionLayerArn, true, scope, lam, runtime);
    }
  });
  return errors;
}

function addLayer(
  layerArn: string,
  isExtensionLayer: boolean,
  scope: Construct,
  lam: lambda.Function,
  runtime: string,
) {
  const layerId = generateLayerId(isExtensionLayer, lam.functionArn, runtime);

  if (layerArn !== undefined) {
    let lambdaLayer = layers.get(layerArn);
    if (lambdaLayer === undefined) {
      lambdaLayer = lambda.LayerVersion.fromLayerVersionArn(scope, layerId, layerArn);
      layers.set(layerArn, lambdaLayer);
    }
    log.debug(`Adding layer ${lambdaLayer} to Lambda: ${lam.functionName}`);
    lam.addLayers(lambdaLayer);
  }
}

export function getLambdaLayerArn(
  region: string,
  version: number,
  runtime: string,
  isArm: boolean,
  isNode: boolean,
  accountId?: string,
) {
  const baseLayerName = runtimeToLayerName[runtime];
  const layerName = isArm && !isNode ? `${baseLayerName}-ARM` : baseLayerName;
  const partition = getAWSPartitionFromRegion(region);
  // TODO: edge case where gov cloud is the region, but they are using a token so we can't resolve it.
  const isGovCloud = govCloudRegions.includes(region);

  // if this is a GovCloud region, use the GovCloud lambda layer
  if (isGovCloud) {
    log.debug("GovCloud region detected, using the GovCloud lambda layer");
    return `arn:${partition}:lambda:${region}:${accountId ?? DD_GOV_ACCOUNT_ID}:layer:${layerName}:${version}`;
  }
  return `arn:${partition}:lambda:${region}:${accountId ?? DD_ACCOUNT_ID}:layer:${layerName}:${version}`;
}

export function getExtensionLayerArn(region: string, version: number, isArm: boolean, accountId?: string) {
  const baseLayerName = "Datadog-Extension";
  const layerName = isArm ? `${baseLayerName}-ARM` : baseLayerName;
  const partition = getAWSPartitionFromRegion(region);
  const isGovCloud = govCloudRegions.includes(region);
  if (isGovCloud) {
    log.debug("GovCloud region detected, using the GovCloud extension layer");
    return `arn:${partition}:lambda:${region}:${accountId ?? DD_GOV_ACCOUNT_ID}:layer:${layerName}:${version}`;
  }
  return `arn:${partition}:lambda:${region}:${accountId ?? DD_ACCOUNT_ID}:layer:${layerName}:${version}`;
}

export function getMissingLayerVersionErrorMsg(functionKey: string, formalRuntime: string, paramRuntime: string) {
  return (
    `Resource ${functionKey} has a ${formalRuntime} runtime, but no ${formalRuntime} Lambda Library version was provided. ` +
    `Please add the '${paramRuntime}LayerVersion' parameter for the Datadog serverless macro.`
  );
}

export function generateLambdaLayerId(lambdaFunctionArn: string, runtime: string) {
  log.debug("Generating construct Id for Datadog Lambda layer");
  const layerValue: string = crypto.createHash("sha256").update(lambdaFunctionArn).digest("hex");
  return `${LAYER_PREFIX}-${runtime}-${layerValue}`;
}

export function generateExtensionLayerId(lambdaFunctionArn: string) {
  log.debug("Generating construct Id for Datadog Extension layer");
  const layerValue: string = crypto.createHash("sha256").update(lambdaFunctionArn).digest("hex");
  return `${EXTENSION_LAYER_PREFIX}-${layerValue}`;
}

export function generateLayerId(isExtensionLayer: boolean, functionArn: string, runtime: string) {
  if (isExtensionLayer) {
    return generateExtensionLayerId(functionArn);
  }
  return generateLambdaLayerId(functionArn, runtime);
}

function getAWSPartitionFromRegion(region: string) {
  if (region.startsWith("us-gov-")) {
    return "aws-us-gov";
  }
  if (region.startsWith("cn-")) {
    return "aws-cn";
  }
  return "aws";
}
