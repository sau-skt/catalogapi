import crc32 from 'buffer-crc32';
import { XMLParser } from 'fast-xml-parser';
import * as errors from "../errors.mjs";
import { SelectResults } from "../helpers.mjs";
import { isObject, parseXml, readableStream, sanitizeETag, sanitizeObjectKey, toArray } from "./helper.mjs";
import { readAsString } from "./response.mjs";
import { RETENTION_VALIDITY_UNITS } from "./type.mjs";

// parse XML response for bucket region
export function parseBucketRegion(xml) {
  // return region information
  return parseXml(xml).LocationConstraint;
}
const fxp = new XMLParser();

// Parse XML and return information as Javascript types
// parse error XML response
export function parseError(xml, headerInfo) {
  let xmlErr = {};
  const xmlObj = fxp.parse(xml);
  if (xmlObj.Error) {
    xmlErr = xmlObj.Error;
  }
  const e = new errors.S3Error();
  Object.entries(xmlErr).forEach(([key, value]) => {
    e[key.toLowerCase()] = value;
  });
  Object.entries(headerInfo).forEach(([key, value]) => {
    e[key] = value;
  });
  return e;
}

// Generates an Error object depending on http statusCode and XML body
export async function parseResponseError(response) {
  const statusCode = response.statusCode;
  let code, message;
  if (statusCode === 301) {
    code = 'MovedPermanently';
    message = 'Moved Permanently';
  } else if (statusCode === 307) {
    code = 'TemporaryRedirect';
    message = 'Are you using the correct endpoint URL?';
  } else if (statusCode === 403) {
    code = 'AccessDenied';
    message = 'Valid and authorized credentials required';
  } else if (statusCode === 404) {
    code = 'NotFound';
    message = 'Not Found';
  } else if (statusCode === 405) {
    code = 'MethodNotAllowed';
    message = 'Method Not Allowed';
  } else if (statusCode === 501) {
    code = 'MethodNotAllowed';
    message = 'Method Not Allowed';
  } else {
    code = 'UnknownError';
    message = `${statusCode}`;
  }
  const headerInfo = {};
  // A value created by S3 compatible server that uniquely identifies the request.
  headerInfo.amzRequestid = response.headers['x-amz-request-id'];
  // A special token that helps troubleshoot API replies and issues.
  headerInfo.amzId2 = response.headers['x-amz-id-2'];

  // Region where the bucket is located. This header is returned only
  // in HEAD bucket and ListObjects response.
  headerInfo.amzBucketRegion = response.headers['x-amz-bucket-region'];
  const xmlString = await readAsString(response);
  if (xmlString) {
    throw parseError(xmlString, headerInfo);
  }

  // Message should be instantiated for each S3Errors.
  const e = new errors.S3Error(message, {
    cause: headerInfo
  });
  // S3 Error code.
  e.code = code;
  Object.entries(headerInfo).forEach(([key, value]) => {
    // @ts-expect-error force set error properties
    e[key] = value;
  });
  throw e;
}

/**
 * parse XML response for list objects v2 with metadata in a bucket
 */
export function parseListObjectsV2WithMetadata(xml) {
  const result = {
    objects: [],
    isTruncated: false,
    nextContinuationToken: ''
  };
  let xmlobj = parseXml(xml);
  if (!xmlobj.ListBucketResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListBucketResult"');
  }
  xmlobj = xmlobj.ListBucketResult;
  if (xmlobj.IsTruncated) {
    result.isTruncated = xmlobj.IsTruncated;
  }
  if (xmlobj.NextContinuationToken) {
    result.nextContinuationToken = xmlobj.NextContinuationToken;
  }
  if (xmlobj.Contents) {
    toArray(xmlobj.Contents).forEach(content => {
      const name = sanitizeObjectKey(content.Key);
      const lastModified = new Date(content.LastModified);
      const etag = sanitizeETag(content.ETag);
      const size = content.Size;
      let metadata;
      if (content.UserMetadata != null) {
        metadata = toArray(content.UserMetadata)[0];
      } else {
        metadata = null;
      }
      result.objects.push({
        name,
        lastModified,
        etag,
        size,
        metadata
      });
    });
  }
  if (xmlobj.CommonPrefixes) {
    toArray(xmlobj.CommonPrefixes).forEach(commonPrefix => {
      result.objects.push({
        prefix: sanitizeObjectKey(toArray(commonPrefix.Prefix)[0]),
        size: 0
      });
    });
  }
  return result;
}
// parse XML response for list parts of an in progress multipart upload
export function parseListParts(xml) {
  let xmlobj = parseXml(xml);
  const result = {
    isTruncated: false,
    parts: [],
    marker: 0
  };
  if (!xmlobj.ListPartsResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListPartsResult"');
  }
  xmlobj = xmlobj.ListPartsResult;
  if (xmlobj.IsTruncated) {
    result.isTruncated = xmlobj.IsTruncated;
  }
  if (xmlobj.NextPartNumberMarker) {
    result.marker = toArray(xmlobj.NextPartNumberMarker)[0] || '';
  }
  if (xmlobj.Part) {
    toArray(xmlobj.Part).forEach(p => {
      const part = parseInt(toArray(p.PartNumber)[0], 10);
      const lastModified = new Date(p.LastModified);
      const etag = p.ETag.replace(/^"/g, '').replace(/"$/g, '').replace(/^&quot;/g, '').replace(/&quot;$/g, '').replace(/^&#34;/g, '').replace(/&#34;$/g, '');
      result.parts.push({
        part,
        lastModified,
        etag,
        size: parseInt(p.Size, 10)
      });
    });
  }
  return result;
}
export function parseListBucket(xml) {
  let result = [];
  const parsedXmlRes = parseXml(xml);
  if (!parsedXmlRes.ListAllMyBucketsResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListAllMyBucketsResult"');
  }
  const {
    ListAllMyBucketsResult: {
      Buckets = {}
    } = {}
  } = parsedXmlRes;
  if (Buckets.Bucket) {
    result = toArray(Buckets.Bucket).map((bucket = {}) => {
      const {
        Name: bucketName,
        CreationDate
      } = bucket;
      const creationDate = new Date(CreationDate);
      return {
        name: bucketName,
        creationDate: creationDate
      };
    });
  }
  return result;
}
export function parseInitiateMultipart(xml) {
  let xmlobj = parseXml(xml);
  if (!xmlobj.InitiateMultipartUploadResult) {
    throw new errors.InvalidXMLError('Missing tag: "InitiateMultipartUploadResult"');
  }
  xmlobj = xmlobj.InitiateMultipartUploadResult;
  if (xmlobj.UploadId) {
    return xmlobj.UploadId;
  }
  throw new errors.InvalidXMLError('Missing tag: "UploadId"');
}
export function parseReplicationConfig(xml) {
  const xmlObj = parseXml(xml);
  const {
    Role,
    Rule
  } = xmlObj.ReplicationConfiguration;
  return {
    ReplicationConfiguration: {
      role: Role,
      rules: toArray(Rule)
    }
  };
}
export function parseObjectLegalHoldConfig(xml) {
  const xmlObj = parseXml(xml);
  return xmlObj.LegalHold;
}
export function parseTagging(xml) {
  const xmlObj = parseXml(xml);
  let result = [];
  if (xmlObj.Tagging && xmlObj.Tagging.TagSet && xmlObj.Tagging.TagSet.Tag) {
    const tagResult = xmlObj.Tagging.TagSet.Tag;
    // if it is a single tag convert into an array so that the return value is always an array.
    if (isObject(tagResult)) {
      result.push(tagResult);
    } else {
      result = tagResult;
    }
  }
  return result;
}

// parse XML response when a multipart upload is completed
export function parseCompleteMultipart(xml) {
  const xmlobj = parseXml(xml).CompleteMultipartUploadResult;
  if (xmlobj.Location) {
    const location = toArray(xmlobj.Location)[0];
    const bucket = toArray(xmlobj.Bucket)[0];
    const key = xmlobj.Key;
    const etag = xmlobj.ETag.replace(/^"/g, '').replace(/"$/g, '').replace(/^&quot;/g, '').replace(/&quot;$/g, '').replace(/^&#34;/g, '').replace(/&#34;$/g, '');
    return {
      location,
      bucket,
      key,
      etag
    };
  }
  // Complete Multipart can return XML Error after a 200 OK response
  if (xmlobj.Code && xmlobj.Message) {
    const errCode = toArray(xmlobj.Code)[0];
    const errMessage = toArray(xmlobj.Message)[0];
    return {
      errCode,
      errMessage
    };
  }
}
// parse XML response for listing in-progress multipart uploads
export function parseListMultipart(xml) {
  const result = {
    prefixes: [],
    uploads: [],
    isTruncated: false,
    nextKeyMarker: '',
    nextUploadIdMarker: ''
  };
  let xmlobj = parseXml(xml);
  if (!xmlobj.ListMultipartUploadsResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListMultipartUploadsResult"');
  }
  xmlobj = xmlobj.ListMultipartUploadsResult;
  if (xmlobj.IsTruncated) {
    result.isTruncated = xmlobj.IsTruncated;
  }
  if (xmlobj.NextKeyMarker) {
    result.nextKeyMarker = xmlobj.NextKeyMarker;
  }
  if (xmlobj.NextUploadIdMarker) {
    result.nextUploadIdMarker = xmlobj.nextUploadIdMarker || '';
  }
  if (xmlobj.CommonPrefixes) {
    toArray(xmlobj.CommonPrefixes).forEach(prefix => {
      // @ts-expect-error index check
      result.prefixes.push({
        prefix: sanitizeObjectKey(toArray(prefix.Prefix)[0])
      });
    });
  }
  if (xmlobj.Upload) {
    toArray(xmlobj.Upload).forEach(upload => {
      const key = upload.Key;
      const uploadId = upload.UploadId;
      const initiator = {
        id: upload.Initiator.ID,
        displayName: upload.Initiator.DisplayName
      };
      const owner = {
        id: upload.Owner.ID,
        displayName: upload.Owner.DisplayName
      };
      const storageClass = upload.StorageClass;
      const initiated = new Date(upload.Initiated);
      result.uploads.push({
        key,
        uploadId,
        initiator,
        owner,
        storageClass,
        initiated
      });
    });
  }
  return result;
}
export function parseObjectLockConfig(xml) {
  const xmlObj = parseXml(xml);
  let lockConfigResult = {};
  if (xmlObj.ObjectLockConfiguration) {
    lockConfigResult = {
      objectLockEnabled: xmlObj.ObjectLockConfiguration.ObjectLockEnabled
    };
    let retentionResp;
    if (xmlObj.ObjectLockConfiguration && xmlObj.ObjectLockConfiguration.Rule && xmlObj.ObjectLockConfiguration.Rule.DefaultRetention) {
      retentionResp = xmlObj.ObjectLockConfiguration.Rule.DefaultRetention || {};
      lockConfigResult.mode = retentionResp.Mode;
    }
    if (retentionResp) {
      const isUnitYears = retentionResp.Years;
      if (isUnitYears) {
        lockConfigResult.validity = isUnitYears;
        lockConfigResult.unit = RETENTION_VALIDITY_UNITS.YEARS;
      } else {
        lockConfigResult.validity = retentionResp.Days;
        lockConfigResult.unit = RETENTION_VALIDITY_UNITS.DAYS;
      }
    }
  }
  return lockConfigResult;
}
export function parseBucketVersioningConfig(xml) {
  const xmlObj = parseXml(xml);
  return xmlObj.VersioningConfiguration;
}

// Used only in selectObjectContent API.
// extractHeaderType extracts the first half of the header message, the header type.
function extractHeaderType(stream) {
  const headerNameLen = Buffer.from(stream.read(1)).readUInt8();
  const headerNameWithSeparator = Buffer.from(stream.read(headerNameLen)).toString();
  const splitBySeparator = (headerNameWithSeparator || '').split(':');
  return splitBySeparator.length >= 1 ? splitBySeparator[1] : '';
}
function extractHeaderValue(stream) {
  const bodyLen = Buffer.from(stream.read(2)).readUInt16BE();
  return Buffer.from(stream.read(bodyLen)).toString();
}
export function parseSelectObjectContentResponse(res) {
  const selectResults = new SelectResults({}); // will be returned

  const responseStream = readableStream(res); // convert byte array to a readable responseStream
  // @ts-ignore
  while (responseStream._readableState.length) {
    // Top level responseStream read tracker.
    let msgCrcAccumulator; // accumulate from start of the message till the message crc start.

    const totalByteLengthBuffer = Buffer.from(responseStream.read(4));
    msgCrcAccumulator = crc32(totalByteLengthBuffer);
    const headerBytesBuffer = Buffer.from(responseStream.read(4));
    msgCrcAccumulator = crc32(headerBytesBuffer, msgCrcAccumulator);
    const calculatedPreludeCrc = msgCrcAccumulator.readInt32BE(); // use it to check if any CRC mismatch in header itself.

    const preludeCrcBuffer = Buffer.from(responseStream.read(4)); // read 4 bytes    i.e 4+4 =8 + 4 = 12 ( prelude + prelude crc)
    msgCrcAccumulator = crc32(preludeCrcBuffer, msgCrcAccumulator);
    const totalMsgLength = totalByteLengthBuffer.readInt32BE();
    const headerLength = headerBytesBuffer.readInt32BE();
    const preludeCrcByteValue = preludeCrcBuffer.readInt32BE();
    if (preludeCrcByteValue !== calculatedPreludeCrc) {
      // Handle Header CRC mismatch Error
      throw new Error(`Header Checksum Mismatch, Prelude CRC of ${preludeCrcByteValue} does not equal expected CRC of ${calculatedPreludeCrc}`);
    }
    const headers = {};
    if (headerLength > 0) {
      const headerBytes = Buffer.from(responseStream.read(headerLength));
      msgCrcAccumulator = crc32(headerBytes, msgCrcAccumulator);
      const headerReaderStream = readableStream(headerBytes);
      // @ts-ignore
      while (headerReaderStream._readableState.length) {
        const headerTypeName = extractHeaderType(headerReaderStream);
        headerReaderStream.read(1); // just read and ignore it.
        if (headerTypeName) {
          headers[headerTypeName] = extractHeaderValue(headerReaderStream);
        }
      }
    }
    let payloadStream;
    const payLoadLength = totalMsgLength - headerLength - 16;
    if (payLoadLength > 0) {
      const payLoadBuffer = Buffer.from(responseStream.read(payLoadLength));
      msgCrcAccumulator = crc32(payLoadBuffer, msgCrcAccumulator);
      // read the checksum early and detect any mismatch so we can avoid unnecessary further processing.
      const messageCrcByteValue = Buffer.from(responseStream.read(4)).readInt32BE();
      const calculatedCrc = msgCrcAccumulator.readInt32BE();
      // Handle message CRC Error
      if (messageCrcByteValue !== calculatedCrc) {
        throw new Error(`Message Checksum Mismatch, Message CRC of ${messageCrcByteValue} does not equal expected CRC of ${calculatedCrc}`);
      }
      payloadStream = readableStream(payLoadBuffer);
    }
    const messageType = headers['message-type'];
    switch (messageType) {
      case 'error':
        {
          const errorMessage = headers['error-code'] + ':"' + headers['error-message'] + '"';
          throw new Error(errorMessage);
        }
      case 'event':
        {
          const contentType = headers['content-type'];
          const eventType = headers['event-type'];
          switch (eventType) {
            case 'End':
              {
                selectResults.setResponse(res);
                return selectResults;
              }
            case 'Records':
              {
                var _payloadStream;
                const readData = (_payloadStream = payloadStream) === null || _payloadStream === void 0 ? void 0 : _payloadStream.read(payLoadLength);
                selectResults.setRecords(readData);
                break;
              }
            case 'Progress':
              {
                switch (contentType) {
                  case 'text/xml':
                    {
                      var _payloadStream2;
                      const progressData = (_payloadStream2 = payloadStream) === null || _payloadStream2 === void 0 ? void 0 : _payloadStream2.read(payLoadLength);
                      selectResults.setProgress(progressData.toString());
                      break;
                    }
                  default:
                    {
                      const errorMessage = `Unexpected content-type ${contentType} sent for event-type Progress`;
                      throw new Error(errorMessage);
                    }
                }
              }
              break;
            case 'Stats':
              {
                switch (contentType) {
                  case 'text/xml':
                    {
                      var _payloadStream3;
                      const statsData = (_payloadStream3 = payloadStream) === null || _payloadStream3 === void 0 ? void 0 : _payloadStream3.read(payLoadLength);
                      selectResults.setStats(statsData.toString());
                      break;
                    }
                  default:
                    {
                      const errorMessage = `Unexpected content-type ${contentType} sent for event-type Stats`;
                      throw new Error(errorMessage);
                    }
                }
              }
              break;
            default:
              {
                // Continuation message: Not sure if it is supported. did not find a reference or any message in response.
                // It does not have a payload.
                const warningMessage = `Un implemented event detected  ${messageType}.`;
                // eslint-disable-next-line no-console
                console.warn(warningMessage);
              }
          }
        }
    }
  }
}
export function parseLifecycleConfig(xml) {
  const xmlObj = parseXml(xml);
  return xmlObj.LifecycleConfiguration;
}
export function parseBucketEncryptionConfig(xml) {
  return parseXml(xml);
}
export function parseObjectRetentionConfig(xml) {
  const xmlObj = parseXml(xml);
  const retentionConfig = xmlObj.Retention;
  return {
    mode: retentionConfig.Mode,
    retainUntilDate: retentionConfig.RetainUntilDate
  };
}
export function removeObjectsParser(xml) {
  const xmlObj = parseXml(xml);
  if (xmlObj.DeleteResult && xmlObj.DeleteResult.Error) {
    // return errors as array always. as the response is object in case of single object passed in removeObjects
    return toArray(xmlObj.DeleteResult.Error);
  }
  return [];
}

// parse XML response for copy object
export function parseCopyObject(xml) {
  const result = {
    etag: '',
    lastModified: ''
  };
  let xmlobj = parseXml(xml);
  if (!xmlobj.CopyObjectResult) {
    throw new errors.InvalidXMLError('Missing tag: "CopyObjectResult"');
  }
  xmlobj = xmlobj.CopyObjectResult;
  if (xmlobj.ETag) {
    result.etag = xmlobj.ETag.replace(/^"/g, '').replace(/"$/g, '').replace(/^&quot;/g, '').replace(/&quot;$/g, '').replace(/^&#34;/g, '').replace(/&#34;$/g, '');
  }
  if (xmlobj.LastModified) {
    result.lastModified = new Date(xmlobj.LastModified);
  }
  return result;
}
export function uploadPartParser(xml) {
  const xmlObj = parseXml(xml);
  const respEl = xmlObj.CopyPartResult;
  return respEl;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJjcmMzMiIsIlhNTFBhcnNlciIsImVycm9ycyIsIlNlbGVjdFJlc3VsdHMiLCJpc09iamVjdCIsInBhcnNlWG1sIiwicmVhZGFibGVTdHJlYW0iLCJzYW5pdGl6ZUVUYWciLCJzYW5pdGl6ZU9iamVjdEtleSIsInRvQXJyYXkiLCJyZWFkQXNTdHJpbmciLCJSRVRFTlRJT05fVkFMSURJVFlfVU5JVFMiLCJwYXJzZUJ1Y2tldFJlZ2lvbiIsInhtbCIsIkxvY2F0aW9uQ29uc3RyYWludCIsImZ4cCIsInBhcnNlRXJyb3IiLCJoZWFkZXJJbmZvIiwieG1sRXJyIiwieG1sT2JqIiwicGFyc2UiLCJFcnJvciIsImUiLCJTM0Vycm9yIiwiT2JqZWN0IiwiZW50cmllcyIsImZvckVhY2giLCJrZXkiLCJ2YWx1ZSIsInRvTG93ZXJDYXNlIiwicGFyc2VSZXNwb25zZUVycm9yIiwicmVzcG9uc2UiLCJzdGF0dXNDb2RlIiwiY29kZSIsIm1lc3NhZ2UiLCJhbXpSZXF1ZXN0aWQiLCJoZWFkZXJzIiwiYW16SWQyIiwiYW16QnVja2V0UmVnaW9uIiwieG1sU3RyaW5nIiwiY2F1c2UiLCJwYXJzZUxpc3RPYmplY3RzVjJXaXRoTWV0YWRhdGEiLCJyZXN1bHQiLCJvYmplY3RzIiwiaXNUcnVuY2F0ZWQiLCJuZXh0Q29udGludWF0aW9uVG9rZW4iLCJ4bWxvYmoiLCJMaXN0QnVja2V0UmVzdWx0IiwiSW52YWxpZFhNTEVycm9yIiwiSXNUcnVuY2F0ZWQiLCJOZXh0Q29udGludWF0aW9uVG9rZW4iLCJDb250ZW50cyIsImNvbnRlbnQiLCJuYW1lIiwiS2V5IiwibGFzdE1vZGlmaWVkIiwiRGF0ZSIsIkxhc3RNb2RpZmllZCIsImV0YWciLCJFVGFnIiwic2l6ZSIsIlNpemUiLCJtZXRhZGF0YSIsIlVzZXJNZXRhZGF0YSIsInB1c2giLCJDb21tb25QcmVmaXhlcyIsImNvbW1vblByZWZpeCIsInByZWZpeCIsIlByZWZpeCIsInBhcnNlTGlzdFBhcnRzIiwicGFydHMiLCJtYXJrZXIiLCJMaXN0UGFydHNSZXN1bHQiLCJOZXh0UGFydE51bWJlck1hcmtlciIsIlBhcnQiLCJwIiwicGFydCIsInBhcnNlSW50IiwiUGFydE51bWJlciIsInJlcGxhY2UiLCJwYXJzZUxpc3RCdWNrZXQiLCJwYXJzZWRYbWxSZXMiLCJMaXN0QWxsTXlCdWNrZXRzUmVzdWx0IiwiQnVja2V0cyIsIkJ1Y2tldCIsIm1hcCIsImJ1Y2tldCIsIk5hbWUiLCJidWNrZXROYW1lIiwiQ3JlYXRpb25EYXRlIiwiY3JlYXRpb25EYXRlIiwicGFyc2VJbml0aWF0ZU11bHRpcGFydCIsIkluaXRpYXRlTXVsdGlwYXJ0VXBsb2FkUmVzdWx0IiwiVXBsb2FkSWQiLCJwYXJzZVJlcGxpY2F0aW9uQ29uZmlnIiwiUm9sZSIsIlJ1bGUiLCJSZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24iLCJyb2xlIiwicnVsZXMiLCJwYXJzZU9iamVjdExlZ2FsSG9sZENvbmZpZyIsIkxlZ2FsSG9sZCIsInBhcnNlVGFnZ2luZyIsIlRhZ2dpbmciLCJUYWdTZXQiLCJUYWciLCJ0YWdSZXN1bHQiLCJwYXJzZUNvbXBsZXRlTXVsdGlwYXJ0IiwiQ29tcGxldGVNdWx0aXBhcnRVcGxvYWRSZXN1bHQiLCJMb2NhdGlvbiIsImxvY2F0aW9uIiwiQ29kZSIsIk1lc3NhZ2UiLCJlcnJDb2RlIiwiZXJyTWVzc2FnZSIsInBhcnNlTGlzdE11bHRpcGFydCIsInByZWZpeGVzIiwidXBsb2FkcyIsIm5leHRLZXlNYXJrZXIiLCJuZXh0VXBsb2FkSWRNYXJrZXIiLCJMaXN0TXVsdGlwYXJ0VXBsb2Fkc1Jlc3VsdCIsIk5leHRLZXlNYXJrZXIiLCJOZXh0VXBsb2FkSWRNYXJrZXIiLCJVcGxvYWQiLCJ1cGxvYWQiLCJ1cGxvYWRJZCIsImluaXRpYXRvciIsImlkIiwiSW5pdGlhdG9yIiwiSUQiLCJkaXNwbGF5TmFtZSIsIkRpc3BsYXlOYW1lIiwib3duZXIiLCJPd25lciIsInN0b3JhZ2VDbGFzcyIsIlN0b3JhZ2VDbGFzcyIsImluaXRpYXRlZCIsIkluaXRpYXRlZCIsInBhcnNlT2JqZWN0TG9ja0NvbmZpZyIsImxvY2tDb25maWdSZXN1bHQiLCJPYmplY3RMb2NrQ29uZmlndXJhdGlvbiIsIm9iamVjdExvY2tFbmFibGVkIiwiT2JqZWN0TG9ja0VuYWJsZWQiLCJyZXRlbnRpb25SZXNwIiwiRGVmYXVsdFJldGVudGlvbiIsIm1vZGUiLCJNb2RlIiwiaXNVbml0WWVhcnMiLCJZZWFycyIsInZhbGlkaXR5IiwidW5pdCIsIllFQVJTIiwiRGF5cyIsIkRBWVMiLCJwYXJzZUJ1Y2tldFZlcnNpb25pbmdDb25maWciLCJWZXJzaW9uaW5nQ29uZmlndXJhdGlvbiIsImV4dHJhY3RIZWFkZXJUeXBlIiwic3RyZWFtIiwiaGVhZGVyTmFtZUxlbiIsIkJ1ZmZlciIsImZyb20iLCJyZWFkIiwicmVhZFVJbnQ4IiwiaGVhZGVyTmFtZVdpdGhTZXBhcmF0b3IiLCJ0b1N0cmluZyIsInNwbGl0QnlTZXBhcmF0b3IiLCJzcGxpdCIsImxlbmd0aCIsImV4dHJhY3RIZWFkZXJWYWx1ZSIsImJvZHlMZW4iLCJyZWFkVUludDE2QkUiLCJwYXJzZVNlbGVjdE9iamVjdENvbnRlbnRSZXNwb25zZSIsInJlcyIsInNlbGVjdFJlc3VsdHMiLCJyZXNwb25zZVN0cmVhbSIsIl9yZWFkYWJsZVN0YXRlIiwibXNnQ3JjQWNjdW11bGF0b3IiLCJ0b3RhbEJ5dGVMZW5ndGhCdWZmZXIiLCJoZWFkZXJCeXRlc0J1ZmZlciIsImNhbGN1bGF0ZWRQcmVsdWRlQ3JjIiwicmVhZEludDMyQkUiLCJwcmVsdWRlQ3JjQnVmZmVyIiwidG90YWxNc2dMZW5ndGgiLCJoZWFkZXJMZW5ndGgiLCJwcmVsdWRlQ3JjQnl0ZVZhbHVlIiwiaGVhZGVyQnl0ZXMiLCJoZWFkZXJSZWFkZXJTdHJlYW0iLCJoZWFkZXJUeXBlTmFtZSIsInBheWxvYWRTdHJlYW0iLCJwYXlMb2FkTGVuZ3RoIiwicGF5TG9hZEJ1ZmZlciIsIm1lc3NhZ2VDcmNCeXRlVmFsdWUiLCJjYWxjdWxhdGVkQ3JjIiwibWVzc2FnZVR5cGUiLCJlcnJvck1lc3NhZ2UiLCJjb250ZW50VHlwZSIsImV2ZW50VHlwZSIsInNldFJlc3BvbnNlIiwiX3BheWxvYWRTdHJlYW0iLCJyZWFkRGF0YSIsInNldFJlY29yZHMiLCJfcGF5bG9hZFN0cmVhbTIiLCJwcm9ncmVzc0RhdGEiLCJzZXRQcm9ncmVzcyIsIl9wYXlsb2FkU3RyZWFtMyIsInN0YXRzRGF0YSIsInNldFN0YXRzIiwid2FybmluZ01lc3NhZ2UiLCJjb25zb2xlIiwid2FybiIsInBhcnNlTGlmZWN5Y2xlQ29uZmlnIiwiTGlmZWN5Y2xlQ29uZmlndXJhdGlvbiIsInBhcnNlQnVja2V0RW5jcnlwdGlvbkNvbmZpZyIsInBhcnNlT2JqZWN0UmV0ZW50aW9uQ29uZmlnIiwicmV0ZW50aW9uQ29uZmlnIiwiUmV0ZW50aW9uIiwicmV0YWluVW50aWxEYXRlIiwiUmV0YWluVW50aWxEYXRlIiwicmVtb3ZlT2JqZWN0c1BhcnNlciIsIkRlbGV0ZVJlc3VsdCIsInBhcnNlQ29weU9iamVjdCIsIkNvcHlPYmplY3RSZXN1bHQiLCJ1cGxvYWRQYXJ0UGFyc2VyIiwicmVzcEVsIiwiQ29weVBhcnRSZXN1bHQiXSwic291cmNlcyI6WyJ4bWwtcGFyc2VyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlICogYXMgaHR0cCBmcm9tICdub2RlOmh0dHAnXG5pbXBvcnQgdHlwZSBzdHJlYW0gZnJvbSAnbm9kZTpzdHJlYW0nXG5cbmltcG9ydCBjcmMzMiBmcm9tICdidWZmZXItY3JjMzInXG5pbXBvcnQgeyBYTUxQYXJzZXIgfSBmcm9tICdmYXN0LXhtbC1wYXJzZXInXG5cbmltcG9ydCAqIGFzIGVycm9ycyBmcm9tICcuLi9lcnJvcnMudHMnXG5pbXBvcnQgeyBTZWxlY3RSZXN1bHRzIH0gZnJvbSAnLi4vaGVscGVycy50cydcbmltcG9ydCB7IGlzT2JqZWN0LCBwYXJzZVhtbCwgcmVhZGFibGVTdHJlYW0sIHNhbml0aXplRVRhZywgc2FuaXRpemVPYmplY3RLZXksIHRvQXJyYXkgfSBmcm9tICcuL2hlbHBlci50cydcbmltcG9ydCB7IHJlYWRBc1N0cmluZyB9IGZyb20gJy4vcmVzcG9uc2UudHMnXG5pbXBvcnQgdHlwZSB7XG4gIEJ1Y2tldEl0ZW1Gcm9tTGlzdCxcbiAgQnVja2V0SXRlbVdpdGhNZXRhZGF0YSxcbiAgQ29weU9iamVjdFJlc3VsdFYxLFxuICBPYmplY3RMb2NrSW5mbyxcbiAgUmVwbGljYXRpb25Db25maWcsXG59IGZyb20gJy4vdHlwZS50cydcbmltcG9ydCB7IFJFVEVOVElPTl9WQUxJRElUWV9VTklUUyB9IGZyb20gJy4vdHlwZS50cydcblxuLy8gcGFyc2UgWE1MIHJlc3BvbnNlIGZvciBidWNrZXQgcmVnaW9uXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VCdWNrZXRSZWdpb24oeG1sOiBzdHJpbmcpOiBzdHJpbmcge1xuICAvLyByZXR1cm4gcmVnaW9uIGluZm9ybWF0aW9uXG4gIHJldHVybiBwYXJzZVhtbCh4bWwpLkxvY2F0aW9uQ29uc3RyYWludFxufVxuXG5jb25zdCBmeHAgPSBuZXcgWE1MUGFyc2VyKClcblxuLy8gUGFyc2UgWE1MIGFuZCByZXR1cm4gaW5mb3JtYXRpb24gYXMgSmF2YXNjcmlwdCB0eXBlc1xuLy8gcGFyc2UgZXJyb3IgWE1MIHJlc3BvbnNlXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VFcnJvcih4bWw6IHN0cmluZywgaGVhZGVySW5mbzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIHtcbiAgbGV0IHhtbEVyciA9IHt9XG4gIGNvbnN0IHhtbE9iaiA9IGZ4cC5wYXJzZSh4bWwpXG4gIGlmICh4bWxPYmouRXJyb3IpIHtcbiAgICB4bWxFcnIgPSB4bWxPYmouRXJyb3JcbiAgfVxuICBjb25zdCBlID0gbmV3IGVycm9ycy5TM0Vycm9yKCkgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPlxuICBPYmplY3QuZW50cmllcyh4bWxFcnIpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgIGVba2V5LnRvTG93ZXJDYXNlKCldID0gdmFsdWVcbiAgfSlcbiAgT2JqZWN0LmVudHJpZXMoaGVhZGVySW5mbykuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiB7XG4gICAgZVtrZXldID0gdmFsdWVcbiAgfSlcbiAgcmV0dXJuIGVcbn1cblxuLy8gR2VuZXJhdGVzIGFuIEVycm9yIG9iamVjdCBkZXBlbmRpbmcgb24gaHR0cCBzdGF0dXNDb2RlIGFuZCBYTUwgYm9keVxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlUmVzcG9uc2VFcnJvcihyZXNwb25zZTogaHR0cC5JbmNvbWluZ01lc3NhZ2UpIHtcbiAgY29uc3Qgc3RhdHVzQ29kZSA9IHJlc3BvbnNlLnN0YXR1c0NvZGVcbiAgbGV0IGNvZGU6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nXG4gIGlmIChzdGF0dXNDb2RlID09PSAzMDEpIHtcbiAgICBjb2RlID0gJ01vdmVkUGVybWFuZW50bHknXG4gICAgbWVzc2FnZSA9ICdNb3ZlZCBQZXJtYW5lbnRseSdcbiAgfSBlbHNlIGlmIChzdGF0dXNDb2RlID09PSAzMDcpIHtcbiAgICBjb2RlID0gJ1RlbXBvcmFyeVJlZGlyZWN0J1xuICAgIG1lc3NhZ2UgPSAnQXJlIHlvdSB1c2luZyB0aGUgY29ycmVjdCBlbmRwb2ludCBVUkw/J1xuICB9IGVsc2UgaWYgKHN0YXR1c0NvZGUgPT09IDQwMykge1xuICAgIGNvZGUgPSAnQWNjZXNzRGVuaWVkJ1xuICAgIG1lc3NhZ2UgPSAnVmFsaWQgYW5kIGF1dGhvcml6ZWQgY3JlZGVudGlhbHMgcmVxdWlyZWQnXG4gIH0gZWxzZSBpZiAoc3RhdHVzQ29kZSA9PT0gNDA0KSB7XG4gICAgY29kZSA9ICdOb3RGb3VuZCdcbiAgICBtZXNzYWdlID0gJ05vdCBGb3VuZCdcbiAgfSBlbHNlIGlmIChzdGF0dXNDb2RlID09PSA0MDUpIHtcbiAgICBjb2RlID0gJ01ldGhvZE5vdEFsbG93ZWQnXG4gICAgbWVzc2FnZSA9ICdNZXRob2QgTm90IEFsbG93ZWQnXG4gIH0gZWxzZSBpZiAoc3RhdHVzQ29kZSA9PT0gNTAxKSB7XG4gICAgY29kZSA9ICdNZXRob2ROb3RBbGxvd2VkJ1xuICAgIG1lc3NhZ2UgPSAnTWV0aG9kIE5vdCBBbGxvd2VkJ1xuICB9IGVsc2Uge1xuICAgIGNvZGUgPSAnVW5rbm93bkVycm9yJ1xuICAgIG1lc3NhZ2UgPSBgJHtzdGF0dXNDb2RlfWBcbiAgfVxuICBjb25zdCBoZWFkZXJJbmZvOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsPiA9IHt9XG4gIC8vIEEgdmFsdWUgY3JlYXRlZCBieSBTMyBjb21wYXRpYmxlIHNlcnZlciB0aGF0IHVuaXF1ZWx5IGlkZW50aWZpZXMgdGhlIHJlcXVlc3QuXG4gIGhlYWRlckluZm8uYW16UmVxdWVzdGlkID0gcmVzcG9uc2UuaGVhZGVyc1sneC1hbXotcmVxdWVzdC1pZCddIGFzIHN0cmluZyB8IHVuZGVmaW5lZFxuICAvLyBBIHNwZWNpYWwgdG9rZW4gdGhhdCBoZWxwcyB0cm91Ymxlc2hvb3QgQVBJIHJlcGxpZXMgYW5kIGlzc3Vlcy5cbiAgaGVhZGVySW5mby5hbXpJZDIgPSByZXNwb25zZS5oZWFkZXJzWyd4LWFtei1pZC0yJ10gYXMgc3RyaW5nIHwgdW5kZWZpbmVkXG5cbiAgLy8gUmVnaW9uIHdoZXJlIHRoZSBidWNrZXQgaXMgbG9jYXRlZC4gVGhpcyBoZWFkZXIgaXMgcmV0dXJuZWQgb25seVxuICAvLyBpbiBIRUFEIGJ1Y2tldCBhbmQgTGlzdE9iamVjdHMgcmVzcG9uc2UuXG4gIGhlYWRlckluZm8uYW16QnVja2V0UmVnaW9uID0gcmVzcG9uc2UuaGVhZGVyc1sneC1hbXotYnVja2V0LXJlZ2lvbiddIGFzIHN0cmluZyB8IHVuZGVmaW5lZFxuXG4gIGNvbnN0IHhtbFN0cmluZyA9IGF3YWl0IHJlYWRBc1N0cmluZyhyZXNwb25zZSlcblxuICBpZiAoeG1sU3RyaW5nKSB7XG4gICAgdGhyb3cgcGFyc2VFcnJvcih4bWxTdHJpbmcsIGhlYWRlckluZm8pXG4gIH1cblxuICAvLyBNZXNzYWdlIHNob3VsZCBiZSBpbnN0YW50aWF0ZWQgZm9yIGVhY2ggUzNFcnJvcnMuXG4gIGNvbnN0IGUgPSBuZXcgZXJyb3JzLlMzRXJyb3IobWVzc2FnZSwgeyBjYXVzZTogaGVhZGVySW5mbyB9KVxuICAvLyBTMyBFcnJvciBjb2RlLlxuICBlLmNvZGUgPSBjb2RlXG4gIE9iamVjdC5lbnRyaWVzKGhlYWRlckluZm8pLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgZm9yY2Ugc2V0IGVycm9yIHByb3BlcnRpZXNcbiAgICBlW2tleV0gPSB2YWx1ZVxuICB9KVxuXG4gIHRocm93IGVcbn1cblxuLyoqXG4gKiBwYXJzZSBYTUwgcmVzcG9uc2UgZm9yIGxpc3Qgb2JqZWN0cyB2MiB3aXRoIG1ldGFkYXRhIGluIGEgYnVja2V0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUxpc3RPYmplY3RzVjJXaXRoTWV0YWRhdGEoeG1sOiBzdHJpbmcpIHtcbiAgY29uc3QgcmVzdWx0OiB7XG4gICAgb2JqZWN0czogQXJyYXk8QnVja2V0SXRlbVdpdGhNZXRhZGF0YT5cbiAgICBpc1RydW5jYXRlZDogYm9vbGVhblxuICAgIG5leHRDb250aW51YXRpb25Ub2tlbjogc3RyaW5nXG4gIH0gPSB7XG4gICAgb2JqZWN0czogW10sXG4gICAgaXNUcnVuY2F0ZWQ6IGZhbHNlLFxuICAgIG5leHRDb250aW51YXRpb25Ub2tlbjogJycsXG4gIH1cblxuICBsZXQgeG1sb2JqID0gcGFyc2VYbWwoeG1sKVxuICBpZiAoIXhtbG9iai5MaXN0QnVja2V0UmVzdWx0KSB7XG4gICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkWE1MRXJyb3IoJ01pc3NpbmcgdGFnOiBcIkxpc3RCdWNrZXRSZXN1bHRcIicpXG4gIH1cbiAgeG1sb2JqID0geG1sb2JqLkxpc3RCdWNrZXRSZXN1bHRcbiAgaWYgKHhtbG9iai5Jc1RydW5jYXRlZCkge1xuICAgIHJlc3VsdC5pc1RydW5jYXRlZCA9IHhtbG9iai5Jc1RydW5jYXRlZFxuICB9XG4gIGlmICh4bWxvYmouTmV4dENvbnRpbnVhdGlvblRva2VuKSB7XG4gICAgcmVzdWx0Lm5leHRDb250aW51YXRpb25Ub2tlbiA9IHhtbG9iai5OZXh0Q29udGludWF0aW9uVG9rZW5cbiAgfVxuXG4gIGlmICh4bWxvYmouQ29udGVudHMpIHtcbiAgICB0b0FycmF5KHhtbG9iai5Db250ZW50cykuZm9yRWFjaCgoY29udGVudCkgPT4ge1xuICAgICAgY29uc3QgbmFtZSA9IHNhbml0aXplT2JqZWN0S2V5KGNvbnRlbnQuS2V5KVxuICAgICAgY29uc3QgbGFzdE1vZGlmaWVkID0gbmV3IERhdGUoY29udGVudC5MYXN0TW9kaWZpZWQpXG4gICAgICBjb25zdCBldGFnID0gc2FuaXRpemVFVGFnKGNvbnRlbnQuRVRhZylcbiAgICAgIGNvbnN0IHNpemUgPSBjb250ZW50LlNpemVcbiAgICAgIGxldCBtZXRhZGF0YVxuICAgICAgaWYgKGNvbnRlbnQuVXNlck1ldGFkYXRhICE9IG51bGwpIHtcbiAgICAgICAgbWV0YWRhdGEgPSB0b0FycmF5KGNvbnRlbnQuVXNlck1ldGFkYXRhKVswXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWV0YWRhdGEgPSBudWxsXG4gICAgICB9XG4gICAgICByZXN1bHQub2JqZWN0cy5wdXNoKHsgbmFtZSwgbGFzdE1vZGlmaWVkLCBldGFnLCBzaXplLCBtZXRhZGF0YSB9KVxuICAgIH0pXG4gIH1cblxuICBpZiAoeG1sb2JqLkNvbW1vblByZWZpeGVzKSB7XG4gICAgdG9BcnJheSh4bWxvYmouQ29tbW9uUHJlZml4ZXMpLmZvckVhY2goKGNvbW1vblByZWZpeCkgPT4ge1xuICAgICAgcmVzdWx0Lm9iamVjdHMucHVzaCh7IHByZWZpeDogc2FuaXRpemVPYmplY3RLZXkodG9BcnJheShjb21tb25QcmVmaXguUHJlZml4KVswXSksIHNpemU6IDAgfSlcbiAgICB9KVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZXhwb3J0IHR5cGUgTXVsdGlwYXJ0ID0ge1xuICB1cGxvYWRzOiBBcnJheTx7XG4gICAga2V5OiBzdHJpbmdcbiAgICB1cGxvYWRJZDogc3RyaW5nXG4gICAgaW5pdGlhdG9yOiB1bmtub3duXG4gICAgb3duZXI6IHVua25vd25cbiAgICBzdG9yYWdlQ2xhc3M6IHVua25vd25cbiAgICBpbml0aWF0ZWQ6IHVua25vd25cbiAgfT5cbiAgcHJlZml4ZXM6IHtcbiAgICBwcmVmaXg6IHN0cmluZ1xuICB9W11cbiAgaXNUcnVuY2F0ZWQ6IGJvb2xlYW5cbiAgbmV4dEtleU1hcmtlcjogdW5kZWZpbmVkXG4gIG5leHRVcGxvYWRJZE1hcmtlcjogdW5kZWZpbmVkXG59XG5cbmV4cG9ydCB0eXBlIFVwbG9hZGVkUGFydCA9IHtcbiAgcGFydDogbnVtYmVyXG4gIGxhc3RNb2RpZmllZD86IERhdGVcbiAgZXRhZzogc3RyaW5nXG4gIHNpemU6IG51bWJlclxufVxuXG4vLyBwYXJzZSBYTUwgcmVzcG9uc2UgZm9yIGxpc3QgcGFydHMgb2YgYW4gaW4gcHJvZ3Jlc3MgbXVsdGlwYXJ0IHVwbG9hZFxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTGlzdFBhcnRzKHhtbDogc3RyaW5nKToge1xuICBpc1RydW5jYXRlZDogYm9vbGVhblxuICBtYXJrZXI6IG51bWJlclxuICBwYXJ0czogVXBsb2FkZWRQYXJ0W11cbn0ge1xuICBsZXQgeG1sb2JqID0gcGFyc2VYbWwoeG1sKVxuICBjb25zdCByZXN1bHQ6IHtcbiAgICBpc1RydW5jYXRlZDogYm9vbGVhblxuICAgIG1hcmtlcjogbnVtYmVyXG4gICAgcGFydHM6IFVwbG9hZGVkUGFydFtdXG4gIH0gPSB7XG4gICAgaXNUcnVuY2F0ZWQ6IGZhbHNlLFxuICAgIHBhcnRzOiBbXSxcbiAgICBtYXJrZXI6IDAsXG4gIH1cbiAgaWYgKCF4bWxvYmouTGlzdFBhcnRzUmVzdWx0KSB7XG4gICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkWE1MRXJyb3IoJ01pc3NpbmcgdGFnOiBcIkxpc3RQYXJ0c1Jlc3VsdFwiJylcbiAgfVxuICB4bWxvYmogPSB4bWxvYmouTGlzdFBhcnRzUmVzdWx0XG4gIGlmICh4bWxvYmouSXNUcnVuY2F0ZWQpIHtcbiAgICByZXN1bHQuaXNUcnVuY2F0ZWQgPSB4bWxvYmouSXNUcnVuY2F0ZWRcbiAgfVxuICBpZiAoeG1sb2JqLk5leHRQYXJ0TnVtYmVyTWFya2VyKSB7XG4gICAgcmVzdWx0Lm1hcmtlciA9IHRvQXJyYXkoeG1sb2JqLk5leHRQYXJ0TnVtYmVyTWFya2VyKVswXSB8fCAnJ1xuICB9XG4gIGlmICh4bWxvYmouUGFydCkge1xuICAgIHRvQXJyYXkoeG1sb2JqLlBhcnQpLmZvckVhY2goKHApID0+IHtcbiAgICAgIGNvbnN0IHBhcnQgPSBwYXJzZUludCh0b0FycmF5KHAuUGFydE51bWJlcilbMF0sIDEwKVxuICAgICAgY29uc3QgbGFzdE1vZGlmaWVkID0gbmV3IERhdGUocC5MYXN0TW9kaWZpZWQpXG4gICAgICBjb25zdCBldGFnID0gcC5FVGFnLnJlcGxhY2UoL15cIi9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoL1wiJC9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoL14mcXVvdDsvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC8mcXVvdDskL2csICcnKVxuICAgICAgICAucmVwbGFjZSgvXiYjMzQ7L2csICcnKVxuICAgICAgICAucmVwbGFjZSgvJiMzNDskL2csICcnKVxuICAgICAgcmVzdWx0LnBhcnRzLnB1c2goeyBwYXJ0LCBsYXN0TW9kaWZpZWQsIGV0YWcsIHNpemU6IHBhcnNlSW50KHAuU2l6ZSwgMTApIH0pXG4gICAgfSlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUxpc3RCdWNrZXQoeG1sOiBzdHJpbmcpIHtcbiAgbGV0IHJlc3VsdDogQnVja2V0SXRlbUZyb21MaXN0W10gPSBbXVxuICBjb25zdCBwYXJzZWRYbWxSZXMgPSBwYXJzZVhtbCh4bWwpXG5cbiAgaWYgKCFwYXJzZWRYbWxSZXMuTGlzdEFsbE15QnVja2V0c1Jlc3VsdCkge1xuICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZFhNTEVycm9yKCdNaXNzaW5nIHRhZzogXCJMaXN0QWxsTXlCdWNrZXRzUmVzdWx0XCInKVxuICB9XG4gIGNvbnN0IHsgTGlzdEFsbE15QnVja2V0c1Jlc3VsdDogeyBCdWNrZXRzID0ge30gfSA9IHt9IH0gPSBwYXJzZWRYbWxSZXNcblxuICBpZiAoQnVja2V0cy5CdWNrZXQpIHtcbiAgICByZXN1bHQgPSB0b0FycmF5KEJ1Y2tldHMuQnVja2V0KS5tYXAoKGJ1Y2tldCA9IHt9KSA9PiB7XG4gICAgICBjb25zdCB7IE5hbWU6IGJ1Y2tldE5hbWUsIENyZWF0aW9uRGF0ZSB9ID0gYnVja2V0XG4gICAgICBjb25zdCBjcmVhdGlvbkRhdGUgPSBuZXcgRGF0ZShDcmVhdGlvbkRhdGUpXG5cbiAgICAgIHJldHVybiB7IG5hbWU6IGJ1Y2tldE5hbWUsIGNyZWF0aW9uRGF0ZTogY3JlYXRpb25EYXRlIH1cbiAgICB9KVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlSW5pdGlhdGVNdWx0aXBhcnQoeG1sOiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgeG1sb2JqID0gcGFyc2VYbWwoeG1sKVxuXG4gIGlmICgheG1sb2JqLkluaXRpYXRlTXVsdGlwYXJ0VXBsb2FkUmVzdWx0KSB7XG4gICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkWE1MRXJyb3IoJ01pc3NpbmcgdGFnOiBcIkluaXRpYXRlTXVsdGlwYXJ0VXBsb2FkUmVzdWx0XCInKVxuICB9XG4gIHhtbG9iaiA9IHhtbG9iai5Jbml0aWF0ZU11bHRpcGFydFVwbG9hZFJlc3VsdFxuXG4gIGlmICh4bWxvYmouVXBsb2FkSWQpIHtcbiAgICByZXR1cm4geG1sb2JqLlVwbG9hZElkXG4gIH1cbiAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkWE1MRXJyb3IoJ01pc3NpbmcgdGFnOiBcIlVwbG9hZElkXCInKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VSZXBsaWNhdGlvbkNvbmZpZyh4bWw6IHN0cmluZyk6IFJlcGxpY2F0aW9uQ29uZmlnIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICBjb25zdCB7IFJvbGUsIFJ1bGUgfSA9IHhtbE9iai5SZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb25cbiAgcmV0dXJuIHtcbiAgICBSZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb246IHtcbiAgICAgIHJvbGU6IFJvbGUsXG4gICAgICBydWxlczogdG9BcnJheShSdWxlKSxcbiAgICB9LFxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU9iamVjdExlZ2FsSG9sZENvbmZpZyh4bWw6IHN0cmluZykge1xuICBjb25zdCB4bWxPYmogPSBwYXJzZVhtbCh4bWwpXG4gIHJldHVybiB4bWxPYmouTGVnYWxIb2xkXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVRhZ2dpbmcoeG1sOiBzdHJpbmcpIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICBsZXQgcmVzdWx0ID0gW11cbiAgaWYgKHhtbE9iai5UYWdnaW5nICYmIHhtbE9iai5UYWdnaW5nLlRhZ1NldCAmJiB4bWxPYmouVGFnZ2luZy5UYWdTZXQuVGFnKSB7XG4gICAgY29uc3QgdGFnUmVzdWx0ID0geG1sT2JqLlRhZ2dpbmcuVGFnU2V0LlRhZ1xuICAgIC8vIGlmIGl0IGlzIGEgc2luZ2xlIHRhZyBjb252ZXJ0IGludG8gYW4gYXJyYXkgc28gdGhhdCB0aGUgcmV0dXJuIHZhbHVlIGlzIGFsd2F5cyBhbiBhcnJheS5cbiAgICBpZiAoaXNPYmplY3QodGFnUmVzdWx0KSkge1xuICAgICAgcmVzdWx0LnB1c2godGFnUmVzdWx0KVxuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQgPSB0YWdSZXN1bHRcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBwYXJzZSBYTUwgcmVzcG9uc2Ugd2hlbiBhIG11bHRpcGFydCB1cGxvYWQgaXMgY29tcGxldGVkXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VDb21wbGV0ZU11bHRpcGFydCh4bWw6IHN0cmluZykge1xuICBjb25zdCB4bWxvYmogPSBwYXJzZVhtbCh4bWwpLkNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkUmVzdWx0XG4gIGlmICh4bWxvYmouTG9jYXRpb24pIHtcbiAgICBjb25zdCBsb2NhdGlvbiA9IHRvQXJyYXkoeG1sb2JqLkxvY2F0aW9uKVswXVxuICAgIGNvbnN0IGJ1Y2tldCA9IHRvQXJyYXkoeG1sb2JqLkJ1Y2tldClbMF1cbiAgICBjb25zdCBrZXkgPSB4bWxvYmouS2V5XG4gICAgY29uc3QgZXRhZyA9IHhtbG9iai5FVGFnLnJlcGxhY2UoL15cIi9nLCAnJylcbiAgICAgIC5yZXBsYWNlKC9cIiQvZywgJycpXG4gICAgICAucmVwbGFjZSgvXiZxdW90Oy9nLCAnJylcbiAgICAgIC5yZXBsYWNlKC8mcXVvdDskL2csICcnKVxuICAgICAgLnJlcGxhY2UoL14mIzM0Oy9nLCAnJylcbiAgICAgIC5yZXBsYWNlKC8mIzM0OyQvZywgJycpXG5cbiAgICByZXR1cm4geyBsb2NhdGlvbiwgYnVja2V0LCBrZXksIGV0YWcgfVxuICB9XG4gIC8vIENvbXBsZXRlIE11bHRpcGFydCBjYW4gcmV0dXJuIFhNTCBFcnJvciBhZnRlciBhIDIwMCBPSyByZXNwb25zZVxuICBpZiAoeG1sb2JqLkNvZGUgJiYgeG1sb2JqLk1lc3NhZ2UpIHtcbiAgICBjb25zdCBlcnJDb2RlID0gdG9BcnJheSh4bWxvYmouQ29kZSlbMF1cbiAgICBjb25zdCBlcnJNZXNzYWdlID0gdG9BcnJheSh4bWxvYmouTWVzc2FnZSlbMF1cbiAgICByZXR1cm4geyBlcnJDb2RlLCBlcnJNZXNzYWdlIH1cbiAgfVxufVxuXG50eXBlIFVwbG9hZElEID0gc3RyaW5nXG5cbmV4cG9ydCB0eXBlIExpc3RNdWx0aXBhcnRSZXN1bHQgPSB7XG4gIHVwbG9hZHM6IHtcbiAgICBrZXk6IHN0cmluZ1xuICAgIHVwbG9hZElkOiBVcGxvYWRJRFxuICAgIGluaXRpYXRvcjogdW5rbm93blxuICAgIG93bmVyOiB1bmtub3duXG4gICAgc3RvcmFnZUNsYXNzOiB1bmtub3duXG4gICAgaW5pdGlhdGVkOiBEYXRlXG4gIH1bXVxuICBwcmVmaXhlczoge1xuICAgIHByZWZpeDogc3RyaW5nXG4gIH1bXVxuICBpc1RydW5jYXRlZDogYm9vbGVhblxuICBuZXh0S2V5TWFya2VyOiBzdHJpbmdcbiAgbmV4dFVwbG9hZElkTWFya2VyOiBzdHJpbmdcbn1cblxuLy8gcGFyc2UgWE1MIHJlc3BvbnNlIGZvciBsaXN0aW5nIGluLXByb2dyZXNzIG11bHRpcGFydCB1cGxvYWRzXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VMaXN0TXVsdGlwYXJ0KHhtbDogc3RyaW5nKTogTGlzdE11bHRpcGFydFJlc3VsdCB7XG4gIGNvbnN0IHJlc3VsdDogTGlzdE11bHRpcGFydFJlc3VsdCA9IHtcbiAgICBwcmVmaXhlczogW10sXG4gICAgdXBsb2FkczogW10sXG4gICAgaXNUcnVuY2F0ZWQ6IGZhbHNlLFxuICAgIG5leHRLZXlNYXJrZXI6ICcnLFxuICAgIG5leHRVcGxvYWRJZE1hcmtlcjogJycsXG4gIH1cblxuICBsZXQgeG1sb2JqID0gcGFyc2VYbWwoeG1sKVxuXG4gIGlmICgheG1sb2JqLkxpc3RNdWx0aXBhcnRVcGxvYWRzUmVzdWx0KSB7XG4gICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkWE1MRXJyb3IoJ01pc3NpbmcgdGFnOiBcIkxpc3RNdWx0aXBhcnRVcGxvYWRzUmVzdWx0XCInKVxuICB9XG4gIHhtbG9iaiA9IHhtbG9iai5MaXN0TXVsdGlwYXJ0VXBsb2Fkc1Jlc3VsdFxuICBpZiAoeG1sb2JqLklzVHJ1bmNhdGVkKSB7XG4gICAgcmVzdWx0LmlzVHJ1bmNhdGVkID0geG1sb2JqLklzVHJ1bmNhdGVkXG4gIH1cbiAgaWYgKHhtbG9iai5OZXh0S2V5TWFya2VyKSB7XG4gICAgcmVzdWx0Lm5leHRLZXlNYXJrZXIgPSB4bWxvYmouTmV4dEtleU1hcmtlclxuICB9XG4gIGlmICh4bWxvYmouTmV4dFVwbG9hZElkTWFya2VyKSB7XG4gICAgcmVzdWx0Lm5leHRVcGxvYWRJZE1hcmtlciA9IHhtbG9iai5uZXh0VXBsb2FkSWRNYXJrZXIgfHwgJydcbiAgfVxuXG4gIGlmICh4bWxvYmouQ29tbW9uUHJlZml4ZXMpIHtcbiAgICB0b0FycmF5KHhtbG9iai5Db21tb25QcmVmaXhlcykuZm9yRWFjaCgocHJlZml4KSA9PiB7XG4gICAgICAvLyBAdHMtZXhwZWN0LWVycm9yIGluZGV4IGNoZWNrXG4gICAgICByZXN1bHQucHJlZml4ZXMucHVzaCh7IHByZWZpeDogc2FuaXRpemVPYmplY3RLZXkodG9BcnJheTxzdHJpbmc+KHByZWZpeC5QcmVmaXgpWzBdKSB9KVxuICAgIH0pXG4gIH1cblxuICBpZiAoeG1sb2JqLlVwbG9hZCkge1xuICAgIHRvQXJyYXkoeG1sb2JqLlVwbG9hZCkuZm9yRWFjaCgodXBsb2FkKSA9PiB7XG4gICAgICBjb25zdCBrZXkgPSB1cGxvYWQuS2V5XG4gICAgICBjb25zdCB1cGxvYWRJZCA9IHVwbG9hZC5VcGxvYWRJZFxuICAgICAgY29uc3QgaW5pdGlhdG9yID0geyBpZDogdXBsb2FkLkluaXRpYXRvci5JRCwgZGlzcGxheU5hbWU6IHVwbG9hZC5Jbml0aWF0b3IuRGlzcGxheU5hbWUgfVxuICAgICAgY29uc3Qgb3duZXIgPSB7IGlkOiB1cGxvYWQuT3duZXIuSUQsIGRpc3BsYXlOYW1lOiB1cGxvYWQuT3duZXIuRGlzcGxheU5hbWUgfVxuICAgICAgY29uc3Qgc3RvcmFnZUNsYXNzID0gdXBsb2FkLlN0b3JhZ2VDbGFzc1xuICAgICAgY29uc3QgaW5pdGlhdGVkID0gbmV3IERhdGUodXBsb2FkLkluaXRpYXRlZClcbiAgICAgIHJlc3VsdC51cGxvYWRzLnB1c2goeyBrZXksIHVwbG9hZElkLCBpbml0aWF0b3IsIG93bmVyLCBzdG9yYWdlQ2xhc3MsIGluaXRpYXRlZCB9KVxuICAgIH0pXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VPYmplY3RMb2NrQ29uZmlnKHhtbDogc3RyaW5nKTogT2JqZWN0TG9ja0luZm8ge1xuICBjb25zdCB4bWxPYmogPSBwYXJzZVhtbCh4bWwpXG4gIGxldCBsb2NrQ29uZmlnUmVzdWx0ID0ge30gYXMgT2JqZWN0TG9ja0luZm9cbiAgaWYgKHhtbE9iai5PYmplY3RMb2NrQ29uZmlndXJhdGlvbikge1xuICAgIGxvY2tDb25maWdSZXN1bHQgPSB7XG4gICAgICBvYmplY3RMb2NrRW5hYmxlZDogeG1sT2JqLk9iamVjdExvY2tDb25maWd1cmF0aW9uLk9iamVjdExvY2tFbmFibGVkLFxuICAgIH0gYXMgT2JqZWN0TG9ja0luZm9cbiAgICBsZXQgcmV0ZW50aW9uUmVzcFxuICAgIGlmIChcbiAgICAgIHhtbE9iai5PYmplY3RMb2NrQ29uZmlndXJhdGlvbiAmJlxuICAgICAgeG1sT2JqLk9iamVjdExvY2tDb25maWd1cmF0aW9uLlJ1bGUgJiZcbiAgICAgIHhtbE9iai5PYmplY3RMb2NrQ29uZmlndXJhdGlvbi5SdWxlLkRlZmF1bHRSZXRlbnRpb25cbiAgICApIHtcbiAgICAgIHJldGVudGlvblJlc3AgPSB4bWxPYmouT2JqZWN0TG9ja0NvbmZpZ3VyYXRpb24uUnVsZS5EZWZhdWx0UmV0ZW50aW9uIHx8IHt9XG4gICAgICBsb2NrQ29uZmlnUmVzdWx0Lm1vZGUgPSByZXRlbnRpb25SZXNwLk1vZGVcbiAgICB9XG4gICAgaWYgKHJldGVudGlvblJlc3ApIHtcbiAgICAgIGNvbnN0IGlzVW5pdFllYXJzID0gcmV0ZW50aW9uUmVzcC5ZZWFyc1xuICAgICAgaWYgKGlzVW5pdFllYXJzKSB7XG4gICAgICAgIGxvY2tDb25maWdSZXN1bHQudmFsaWRpdHkgPSBpc1VuaXRZZWFyc1xuICAgICAgICBsb2NrQ29uZmlnUmVzdWx0LnVuaXQgPSBSRVRFTlRJT05fVkFMSURJVFlfVU5JVFMuWUVBUlNcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvY2tDb25maWdSZXN1bHQudmFsaWRpdHkgPSByZXRlbnRpb25SZXNwLkRheXNcbiAgICAgICAgbG9ja0NvbmZpZ1Jlc3VsdC51bml0ID0gUkVURU5USU9OX1ZBTElESVRZX1VOSVRTLkRBWVNcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gbG9ja0NvbmZpZ1Jlc3VsdFxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VCdWNrZXRWZXJzaW9uaW5nQ29uZmlnKHhtbDogc3RyaW5nKSB7XG4gIGNvbnN0IHhtbE9iaiA9IHBhcnNlWG1sKHhtbClcbiAgcmV0dXJuIHhtbE9iai5WZXJzaW9uaW5nQ29uZmlndXJhdGlvblxufVxuXG4vLyBVc2VkIG9ubHkgaW4gc2VsZWN0T2JqZWN0Q29udGVudCBBUEkuXG4vLyBleHRyYWN0SGVhZGVyVHlwZSBleHRyYWN0cyB0aGUgZmlyc3QgaGFsZiBvZiB0aGUgaGVhZGVyIG1lc3NhZ2UsIHRoZSBoZWFkZXIgdHlwZS5cbmZ1bmN0aW9uIGV4dHJhY3RIZWFkZXJUeXBlKHN0cmVhbTogc3RyZWFtLlJlYWRhYmxlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgaGVhZGVyTmFtZUxlbiA9IEJ1ZmZlci5mcm9tKHN0cmVhbS5yZWFkKDEpKS5yZWFkVUludDgoKVxuICBjb25zdCBoZWFkZXJOYW1lV2l0aFNlcGFyYXRvciA9IEJ1ZmZlci5mcm9tKHN0cmVhbS5yZWFkKGhlYWRlck5hbWVMZW4pKS50b1N0cmluZygpXG4gIGNvbnN0IHNwbGl0QnlTZXBhcmF0b3IgPSAoaGVhZGVyTmFtZVdpdGhTZXBhcmF0b3IgfHwgJycpLnNwbGl0KCc6JylcbiAgcmV0dXJuIHNwbGl0QnlTZXBhcmF0b3IubGVuZ3RoID49IDEgPyBzcGxpdEJ5U2VwYXJhdG9yWzFdIDogJydcbn1cblxuZnVuY3Rpb24gZXh0cmFjdEhlYWRlclZhbHVlKHN0cmVhbTogc3RyZWFtLlJlYWRhYmxlKSB7XG4gIGNvbnN0IGJvZHlMZW4gPSBCdWZmZXIuZnJvbShzdHJlYW0ucmVhZCgyKSkucmVhZFVJbnQxNkJFKClcbiAgcmV0dXJuIEJ1ZmZlci5mcm9tKHN0cmVhbS5yZWFkKGJvZHlMZW4pKS50b1N0cmluZygpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVNlbGVjdE9iamVjdENvbnRlbnRSZXNwb25zZShyZXM6IEJ1ZmZlcikge1xuICBjb25zdCBzZWxlY3RSZXN1bHRzID0gbmV3IFNlbGVjdFJlc3VsdHMoe30pIC8vIHdpbGwgYmUgcmV0dXJuZWRcblxuICBjb25zdCByZXNwb25zZVN0cmVhbSA9IHJlYWRhYmxlU3RyZWFtKHJlcykgLy8gY29udmVydCBieXRlIGFycmF5IHRvIGEgcmVhZGFibGUgcmVzcG9uc2VTdHJlYW1cbiAgLy8gQHRzLWlnbm9yZVxuICB3aGlsZSAocmVzcG9uc2VTdHJlYW0uX3JlYWRhYmxlU3RhdGUubGVuZ3RoKSB7XG4gICAgLy8gVG9wIGxldmVsIHJlc3BvbnNlU3RyZWFtIHJlYWQgdHJhY2tlci5cbiAgICBsZXQgbXNnQ3JjQWNjdW11bGF0b3IgLy8gYWNjdW11bGF0ZSBmcm9tIHN0YXJ0IG9mIHRoZSBtZXNzYWdlIHRpbGwgdGhlIG1lc3NhZ2UgY3JjIHN0YXJ0LlxuXG4gICAgY29uc3QgdG90YWxCeXRlTGVuZ3RoQnVmZmVyID0gQnVmZmVyLmZyb20ocmVzcG9uc2VTdHJlYW0ucmVhZCg0KSlcbiAgICBtc2dDcmNBY2N1bXVsYXRvciA9IGNyYzMyKHRvdGFsQnl0ZUxlbmd0aEJ1ZmZlcilcblxuICAgIGNvbnN0IGhlYWRlckJ5dGVzQnVmZmVyID0gQnVmZmVyLmZyb20ocmVzcG9uc2VTdHJlYW0ucmVhZCg0KSlcbiAgICBtc2dDcmNBY2N1bXVsYXRvciA9IGNyYzMyKGhlYWRlckJ5dGVzQnVmZmVyLCBtc2dDcmNBY2N1bXVsYXRvcilcblxuICAgIGNvbnN0IGNhbGN1bGF0ZWRQcmVsdWRlQ3JjID0gbXNnQ3JjQWNjdW11bGF0b3IucmVhZEludDMyQkUoKSAvLyB1c2UgaXQgdG8gY2hlY2sgaWYgYW55IENSQyBtaXNtYXRjaCBpbiBoZWFkZXIgaXRzZWxmLlxuXG4gICAgY29uc3QgcHJlbHVkZUNyY0J1ZmZlciA9IEJ1ZmZlci5mcm9tKHJlc3BvbnNlU3RyZWFtLnJlYWQoNCkpIC8vIHJlYWQgNCBieXRlcyAgICBpLmUgNCs0ID04ICsgNCA9IDEyICggcHJlbHVkZSArIHByZWx1ZGUgY3JjKVxuICAgIG1zZ0NyY0FjY3VtdWxhdG9yID0gY3JjMzIocHJlbHVkZUNyY0J1ZmZlciwgbXNnQ3JjQWNjdW11bGF0b3IpXG5cbiAgICBjb25zdCB0b3RhbE1zZ0xlbmd0aCA9IHRvdGFsQnl0ZUxlbmd0aEJ1ZmZlci5yZWFkSW50MzJCRSgpXG4gICAgY29uc3QgaGVhZGVyTGVuZ3RoID0gaGVhZGVyQnl0ZXNCdWZmZXIucmVhZEludDMyQkUoKVxuICAgIGNvbnN0IHByZWx1ZGVDcmNCeXRlVmFsdWUgPSBwcmVsdWRlQ3JjQnVmZmVyLnJlYWRJbnQzMkJFKClcblxuICAgIGlmIChwcmVsdWRlQ3JjQnl0ZVZhbHVlICE9PSBjYWxjdWxhdGVkUHJlbHVkZUNyYykge1xuICAgICAgLy8gSGFuZGxlIEhlYWRlciBDUkMgbWlzbWF0Y2ggRXJyb3JcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYEhlYWRlciBDaGVja3N1bSBNaXNtYXRjaCwgUHJlbHVkZSBDUkMgb2YgJHtwcmVsdWRlQ3JjQnl0ZVZhbHVlfSBkb2VzIG5vdCBlcXVhbCBleHBlY3RlZCBDUkMgb2YgJHtjYWxjdWxhdGVkUHJlbHVkZUNyY31gLFxuICAgICAgKVxuICAgIH1cblxuICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge31cbiAgICBpZiAoaGVhZGVyTGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgaGVhZGVyQnl0ZXMgPSBCdWZmZXIuZnJvbShyZXNwb25zZVN0cmVhbS5yZWFkKGhlYWRlckxlbmd0aCkpXG4gICAgICBtc2dDcmNBY2N1bXVsYXRvciA9IGNyYzMyKGhlYWRlckJ5dGVzLCBtc2dDcmNBY2N1bXVsYXRvcilcbiAgICAgIGNvbnN0IGhlYWRlclJlYWRlclN0cmVhbSA9IHJlYWRhYmxlU3RyZWFtKGhlYWRlckJ5dGVzKVxuICAgICAgLy8gQHRzLWlnbm9yZVxuICAgICAgd2hpbGUgKGhlYWRlclJlYWRlclN0cmVhbS5fcmVhZGFibGVTdGF0ZS5sZW5ndGgpIHtcbiAgICAgICAgY29uc3QgaGVhZGVyVHlwZU5hbWUgPSBleHRyYWN0SGVhZGVyVHlwZShoZWFkZXJSZWFkZXJTdHJlYW0pXG4gICAgICAgIGhlYWRlclJlYWRlclN0cmVhbS5yZWFkKDEpIC8vIGp1c3QgcmVhZCBhbmQgaWdub3JlIGl0LlxuICAgICAgICBpZiAoaGVhZGVyVHlwZU5hbWUpIHtcbiAgICAgICAgICBoZWFkZXJzW2hlYWRlclR5cGVOYW1lXSA9IGV4dHJhY3RIZWFkZXJWYWx1ZShoZWFkZXJSZWFkZXJTdHJlYW0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBsZXQgcGF5bG9hZFN0cmVhbVxuICAgIGNvbnN0IHBheUxvYWRMZW5ndGggPSB0b3RhbE1zZ0xlbmd0aCAtIGhlYWRlckxlbmd0aCAtIDE2XG4gICAgaWYgKHBheUxvYWRMZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBwYXlMb2FkQnVmZmVyID0gQnVmZmVyLmZyb20ocmVzcG9uc2VTdHJlYW0ucmVhZChwYXlMb2FkTGVuZ3RoKSlcbiAgICAgIG1zZ0NyY0FjY3VtdWxhdG9yID0gY3JjMzIocGF5TG9hZEJ1ZmZlciwgbXNnQ3JjQWNjdW11bGF0b3IpXG4gICAgICAvLyByZWFkIHRoZSBjaGVja3N1bSBlYXJseSBhbmQgZGV0ZWN0IGFueSBtaXNtYXRjaCBzbyB3ZSBjYW4gYXZvaWQgdW5uZWNlc3NhcnkgZnVydGhlciBwcm9jZXNzaW5nLlxuICAgICAgY29uc3QgbWVzc2FnZUNyY0J5dGVWYWx1ZSA9IEJ1ZmZlci5mcm9tKHJlc3BvbnNlU3RyZWFtLnJlYWQoNCkpLnJlYWRJbnQzMkJFKClcbiAgICAgIGNvbnN0IGNhbGN1bGF0ZWRDcmMgPSBtc2dDcmNBY2N1bXVsYXRvci5yZWFkSW50MzJCRSgpXG4gICAgICAvLyBIYW5kbGUgbWVzc2FnZSBDUkMgRXJyb3JcbiAgICAgIGlmIChtZXNzYWdlQ3JjQnl0ZVZhbHVlICE9PSBjYWxjdWxhdGVkQ3JjKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgTWVzc2FnZSBDaGVja3N1bSBNaXNtYXRjaCwgTWVzc2FnZSBDUkMgb2YgJHttZXNzYWdlQ3JjQnl0ZVZhbHVlfSBkb2VzIG5vdCBlcXVhbCBleHBlY3RlZCBDUkMgb2YgJHtjYWxjdWxhdGVkQ3JjfWAsXG4gICAgICAgIClcbiAgICAgIH1cbiAgICAgIHBheWxvYWRTdHJlYW0gPSByZWFkYWJsZVN0cmVhbShwYXlMb2FkQnVmZmVyKVxuICAgIH1cbiAgICBjb25zdCBtZXNzYWdlVHlwZSA9IGhlYWRlcnNbJ21lc3NhZ2UtdHlwZSddXG5cbiAgICBzd2l0Y2ggKG1lc3NhZ2VUeXBlKSB7XG4gICAgICBjYXNlICdlcnJvcic6IHtcbiAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gaGVhZGVyc1snZXJyb3ItY29kZSddICsgJzpcIicgKyBoZWFkZXJzWydlcnJvci1tZXNzYWdlJ10gKyAnXCInXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihlcnJvck1lc3NhZ2UpXG4gICAgICB9XG4gICAgICBjYXNlICdldmVudCc6IHtcbiAgICAgICAgY29uc3QgY29udGVudFR5cGUgPSBoZWFkZXJzWydjb250ZW50LXR5cGUnXVxuICAgICAgICBjb25zdCBldmVudFR5cGUgPSBoZWFkZXJzWydldmVudC10eXBlJ11cblxuICAgICAgICBzd2l0Y2ggKGV2ZW50VHlwZSkge1xuICAgICAgICAgIGNhc2UgJ0VuZCc6IHtcbiAgICAgICAgICAgIHNlbGVjdFJlc3VsdHMuc2V0UmVzcG9uc2UocmVzKVxuICAgICAgICAgICAgcmV0dXJuIHNlbGVjdFJlc3VsdHNcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjYXNlICdSZWNvcmRzJzoge1xuICAgICAgICAgICAgY29uc3QgcmVhZERhdGEgPSBwYXlsb2FkU3RyZWFtPy5yZWFkKHBheUxvYWRMZW5ndGgpXG4gICAgICAgICAgICBzZWxlY3RSZXN1bHRzLnNldFJlY29yZHMocmVhZERhdGEpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNhc2UgJ1Byb2dyZXNzJzpcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3dpdGNoIChjb250ZW50VHlwZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ3RleHQveG1sJzoge1xuICAgICAgICAgICAgICAgICAgY29uc3QgcHJvZ3Jlc3NEYXRhID0gcGF5bG9hZFN0cmVhbT8ucmVhZChwYXlMb2FkTGVuZ3RoKVxuICAgICAgICAgICAgICAgICAgc2VsZWN0UmVzdWx0cy5zZXRQcm9ncmVzcyhwcm9ncmVzc0RhdGEudG9TdHJpbmcoKSlcbiAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGBVbmV4cGVjdGVkIGNvbnRlbnQtdHlwZSAke2NvbnRlbnRUeXBlfSBzZW50IGZvciBldmVudC10eXBlIFByb2dyZXNzYFxuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGVycm9yTWVzc2FnZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSAnU3RhdHMnOlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBzd2l0Y2ggKGNvbnRlbnRUeXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAndGV4dC94bWwnOiB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBzdGF0c0RhdGEgPSBwYXlsb2FkU3RyZWFtPy5yZWFkKHBheUxvYWRMZW5ndGgpXG4gICAgICAgICAgICAgICAgICBzZWxlY3RSZXN1bHRzLnNldFN0YXRzKHN0YXRzRGF0YS50b1N0cmluZygpKVxuICAgICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZGVmYXVsdDoge1xuICAgICAgICAgICAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gYFVuZXhwZWN0ZWQgY29udGVudC10eXBlICR7Y29udGVudFR5cGV9IHNlbnQgZm9yIGV2ZW50LXR5cGUgU3RhdHNgXG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZXJyb3JNZXNzYWdlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICAvLyBDb250aW51YXRpb24gbWVzc2FnZTogTm90IHN1cmUgaWYgaXQgaXMgc3VwcG9ydGVkLiBkaWQgbm90IGZpbmQgYSByZWZlcmVuY2Ugb3IgYW55IG1lc3NhZ2UgaW4gcmVzcG9uc2UuXG4gICAgICAgICAgICAvLyBJdCBkb2VzIG5vdCBoYXZlIGEgcGF5bG9hZC5cbiAgICAgICAgICAgIGNvbnN0IHdhcm5pbmdNZXNzYWdlID0gYFVuIGltcGxlbWVudGVkIGV2ZW50IGRldGVjdGVkICAke21lc3NhZ2VUeXBlfS5gXG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgICAgICAgY29uc29sZS53YXJuKHdhcm5pbmdNZXNzYWdlKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VMaWZlY3ljbGVDb25maWcoeG1sOiBzdHJpbmcpIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICByZXR1cm4geG1sT2JqLkxpZmVjeWNsZUNvbmZpZ3VyYXRpb25cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQnVja2V0RW5jcnlwdGlvbkNvbmZpZyh4bWw6IHN0cmluZykge1xuICByZXR1cm4gcGFyc2VYbWwoeG1sKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VPYmplY3RSZXRlbnRpb25Db25maWcoeG1sOiBzdHJpbmcpIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICBjb25zdCByZXRlbnRpb25Db25maWcgPSB4bWxPYmouUmV0ZW50aW9uXG4gIHJldHVybiB7XG4gICAgbW9kZTogcmV0ZW50aW9uQ29uZmlnLk1vZGUsXG4gICAgcmV0YWluVW50aWxEYXRlOiByZXRlbnRpb25Db25maWcuUmV0YWluVW50aWxEYXRlLFxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVPYmplY3RzUGFyc2VyKHhtbDogc3RyaW5nKSB7XG4gIGNvbnN0IHhtbE9iaiA9IHBhcnNlWG1sKHhtbClcbiAgaWYgKHhtbE9iai5EZWxldGVSZXN1bHQgJiYgeG1sT2JqLkRlbGV0ZVJlc3VsdC5FcnJvcikge1xuICAgIC8vIHJldHVybiBlcnJvcnMgYXMgYXJyYXkgYWx3YXlzLiBhcyB0aGUgcmVzcG9uc2UgaXMgb2JqZWN0IGluIGNhc2Ugb2Ygc2luZ2xlIG9iamVjdCBwYXNzZWQgaW4gcmVtb3ZlT2JqZWN0c1xuICAgIHJldHVybiB0b0FycmF5KHhtbE9iai5EZWxldGVSZXN1bHQuRXJyb3IpXG4gIH1cbiAgcmV0dXJuIFtdXG59XG5cbi8vIHBhcnNlIFhNTCByZXNwb25zZSBmb3IgY29weSBvYmplY3RcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUNvcHlPYmplY3QoeG1sOiBzdHJpbmcpOiBDb3B5T2JqZWN0UmVzdWx0VjEge1xuICBjb25zdCByZXN1bHQ6IENvcHlPYmplY3RSZXN1bHRWMSA9IHtcbiAgICBldGFnOiAnJyxcbiAgICBsYXN0TW9kaWZpZWQ6ICcnLFxuICB9XG5cbiAgbGV0IHhtbG9iaiA9IHBhcnNlWG1sKHhtbClcbiAgaWYgKCF4bWxvYmouQ29weU9iamVjdFJlc3VsdCkge1xuICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZFhNTEVycm9yKCdNaXNzaW5nIHRhZzogXCJDb3B5T2JqZWN0UmVzdWx0XCInKVxuICB9XG4gIHhtbG9iaiA9IHhtbG9iai5Db3B5T2JqZWN0UmVzdWx0XG4gIGlmICh4bWxvYmouRVRhZykge1xuICAgIHJlc3VsdC5ldGFnID0geG1sb2JqLkVUYWcucmVwbGFjZSgvXlwiL2csICcnKVxuICAgICAgLnJlcGxhY2UoL1wiJC9nLCAnJylcbiAgICAgIC5yZXBsYWNlKC9eJnF1b3Q7L2csICcnKVxuICAgICAgLnJlcGxhY2UoLyZxdW90OyQvZywgJycpXG4gICAgICAucmVwbGFjZSgvXiYjMzQ7L2csICcnKVxuICAgICAgLnJlcGxhY2UoLyYjMzQ7JC9nLCAnJylcbiAgfVxuICBpZiAoeG1sb2JqLkxhc3RNb2RpZmllZCkge1xuICAgIHJlc3VsdC5sYXN0TW9kaWZpZWQgPSBuZXcgRGF0ZSh4bWxvYmouTGFzdE1vZGlmaWVkKVxuICB9XG5cbiAgcmV0dXJuIHJlc3VsdFxufVxuZXhwb3J0IGZ1bmN0aW9uIHVwbG9hZFBhcnRQYXJzZXIoeG1sOiBzdHJpbmcpIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICBjb25zdCByZXNwRWwgPSB4bWxPYmouQ29weVBhcnRSZXN1bHRcbiAgcmV0dXJuIHJlc3BFbFxufVxuIl0sIm1hcHBpbmdzIjoiQUFHQSxPQUFPQSxLQUFLLE1BQU0sY0FBYztBQUNoQyxTQUFTQyxTQUFTLFFBQVEsaUJBQWlCO0FBRTNDLE9BQU8sS0FBS0MsTUFBTSxNQUFNLGVBQWM7QUFDdEMsU0FBU0MsYUFBYSxRQUFRLGdCQUFlO0FBQzdDLFNBQVNDLFFBQVEsRUFBRUMsUUFBUSxFQUFFQyxjQUFjLEVBQUVDLFlBQVksRUFBRUMsaUJBQWlCLEVBQUVDLE9BQU8sUUFBUSxjQUFhO0FBQzFHLFNBQVNDLFlBQVksUUFBUSxnQkFBZTtBQVE1QyxTQUFTQyx3QkFBd0IsUUFBUSxZQUFXOztBQUVwRDtBQUNBLE9BQU8sU0FBU0MsaUJBQWlCQSxDQUFDQyxHQUFXLEVBQVU7RUFDckQ7RUFDQSxPQUFPUixRQUFRLENBQUNR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