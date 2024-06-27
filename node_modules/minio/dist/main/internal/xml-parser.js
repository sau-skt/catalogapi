"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.parseBucketEncryptionConfig = parseBucketEncryptionConfig;
exports.parseBucketRegion = parseBucketRegion;
exports.parseBucketVersioningConfig = parseBucketVersioningConfig;
exports.parseCompleteMultipart = parseCompleteMultipart;
exports.parseCopyObject = parseCopyObject;
exports.parseError = parseError;
exports.parseInitiateMultipart = parseInitiateMultipart;
exports.parseLifecycleConfig = parseLifecycleConfig;
exports.parseListBucket = parseListBucket;
exports.parseListMultipart = parseListMultipart;
exports.parseListObjectsV2WithMetadata = parseListObjectsV2WithMetadata;
exports.parseListParts = parseListParts;
exports.parseObjectLegalHoldConfig = parseObjectLegalHoldConfig;
exports.parseObjectLockConfig = parseObjectLockConfig;
exports.parseObjectRetentionConfig = parseObjectRetentionConfig;
exports.parseReplicationConfig = parseReplicationConfig;
exports.parseResponseError = parseResponseError;
exports.parseSelectObjectContentResponse = parseSelectObjectContentResponse;
exports.parseTagging = parseTagging;
exports.removeObjectsParser = removeObjectsParser;
exports.uploadPartParser = uploadPartParser;
var _bufferCrc = require("buffer-crc32");
var _fastXmlParser = require("fast-xml-parser");
var errors = _interopRequireWildcard(require("../errors.js"), true);
var _helpers = require("../helpers.js");
var _helper = require("./helper.js");
var _response = require("./response.js");
var _type = require("./type.js");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
// parse XML response for bucket region
function parseBucketRegion(xml) {
  // return region information
  return (0, _helper.parseXml)(xml).LocationConstraint;
}
const fxp = new _fastXmlParser.XMLParser();

// Parse XML and return information as Javascript types
// parse error XML response
function parseError(xml, headerInfo) {
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
async function parseResponseError(response) {
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
  const xmlString = await (0, _response.readAsString)(response);
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
function parseListObjectsV2WithMetadata(xml) {
  const result = {
    objects: [],
    isTruncated: false,
    nextContinuationToken: ''
  };
  let xmlobj = (0, _helper.parseXml)(xml);
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
    (0, _helper.toArray)(xmlobj.Contents).forEach(content => {
      const name = (0, _helper.sanitizeObjectKey)(content.Key);
      const lastModified = new Date(content.LastModified);
      const etag = (0, _helper.sanitizeETag)(content.ETag);
      const size = content.Size;
      let metadata;
      if (content.UserMetadata != null) {
        metadata = (0, _helper.toArray)(content.UserMetadata)[0];
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
    (0, _helper.toArray)(xmlobj.CommonPrefixes).forEach(commonPrefix => {
      result.objects.push({
        prefix: (0, _helper.sanitizeObjectKey)((0, _helper.toArray)(commonPrefix.Prefix)[0]),
        size: 0
      });
    });
  }
  return result;
}
// parse XML response for list parts of an in progress multipart upload
function parseListParts(xml) {
  let xmlobj = (0, _helper.parseXml)(xml);
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
    result.marker = (0, _helper.toArray)(xmlobj.NextPartNumberMarker)[0] || '';
  }
  if (xmlobj.Part) {
    (0, _helper.toArray)(xmlobj.Part).forEach(p => {
      const part = parseInt((0, _helper.toArray)(p.PartNumber)[0], 10);
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
function parseListBucket(xml) {
  let result = [];
  const parsedXmlRes = (0, _helper.parseXml)(xml);
  if (!parsedXmlRes.ListAllMyBucketsResult) {
    throw new errors.InvalidXMLError('Missing tag: "ListAllMyBucketsResult"');
  }
  const {
    ListAllMyBucketsResult: {
      Buckets = {}
    } = {}
  } = parsedXmlRes;
  if (Buckets.Bucket) {
    result = (0, _helper.toArray)(Buckets.Bucket).map((bucket = {}) => {
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
function parseInitiateMultipart(xml) {
  let xmlobj = (0, _helper.parseXml)(xml);
  if (!xmlobj.InitiateMultipartUploadResult) {
    throw new errors.InvalidXMLError('Missing tag: "InitiateMultipartUploadResult"');
  }
  xmlobj = xmlobj.InitiateMultipartUploadResult;
  if (xmlobj.UploadId) {
    return xmlobj.UploadId;
  }
  throw new errors.InvalidXMLError('Missing tag: "UploadId"');
}
function parseReplicationConfig(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
  const {
    Role,
    Rule
  } = xmlObj.ReplicationConfiguration;
  return {
    ReplicationConfiguration: {
      role: Role,
      rules: (0, _helper.toArray)(Rule)
    }
  };
}
function parseObjectLegalHoldConfig(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
  return xmlObj.LegalHold;
}
function parseTagging(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
  let result = [];
  if (xmlObj.Tagging && xmlObj.Tagging.TagSet && xmlObj.Tagging.TagSet.Tag) {
    const tagResult = xmlObj.Tagging.TagSet.Tag;
    // if it is a single tag convert into an array so that the return value is always an array.
    if ((0, _helper.isObject)(tagResult)) {
      result.push(tagResult);
    } else {
      result = tagResult;
    }
  }
  return result;
}

// parse XML response when a multipart upload is completed
function parseCompleteMultipart(xml) {
  const xmlobj = (0, _helper.parseXml)(xml).CompleteMultipartUploadResult;
  if (xmlobj.Location) {
    const location = (0, _helper.toArray)(xmlobj.Location)[0];
    const bucket = (0, _helper.toArray)(xmlobj.Bucket)[0];
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
    const errCode = (0, _helper.toArray)(xmlobj.Code)[0];
    const errMessage = (0, _helper.toArray)(xmlobj.Message)[0];
    return {
      errCode,
      errMessage
    };
  }
}
// parse XML response for listing in-progress multipart uploads
function parseListMultipart(xml) {
  const result = {
    prefixes: [],
    uploads: [],
    isTruncated: false,
    nextKeyMarker: '',
    nextUploadIdMarker: ''
  };
  let xmlobj = (0, _helper.parseXml)(xml);
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
    (0, _helper.toArray)(xmlobj.CommonPrefixes).forEach(prefix => {
      // @ts-expect-error index check
      result.prefixes.push({
        prefix: (0, _helper.sanitizeObjectKey)((0, _helper.toArray)(prefix.Prefix)[0])
      });
    });
  }
  if (xmlobj.Upload) {
    (0, _helper.toArray)(xmlobj.Upload).forEach(upload => {
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
function parseObjectLockConfig(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
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
        lockConfigResult.unit = _type.RETENTION_VALIDITY_UNITS.YEARS;
      } else {
        lockConfigResult.validity = retentionResp.Days;
        lockConfigResult.unit = _type.RETENTION_VALIDITY_UNITS.DAYS;
      }
    }
  }
  return lockConfigResult;
}
function parseBucketVersioningConfig(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
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
function parseSelectObjectContentResponse(res) {
  const selectResults = new _helpers.SelectResults({}); // will be returned

  const responseStream = (0, _helper.readableStream)(res); // convert byte array to a readable responseStream
  // @ts-ignore
  while (responseStream._readableState.length) {
    // Top level responseStream read tracker.
    let msgCrcAccumulator; // accumulate from start of the message till the message crc start.

    const totalByteLengthBuffer = Buffer.from(responseStream.read(4));
    msgCrcAccumulator = _bufferCrc(totalByteLengthBuffer);
    const headerBytesBuffer = Buffer.from(responseStream.read(4));
    msgCrcAccumulator = _bufferCrc(headerBytesBuffer, msgCrcAccumulator);
    const calculatedPreludeCrc = msgCrcAccumulator.readInt32BE(); // use it to check if any CRC mismatch in header itself.

    const preludeCrcBuffer = Buffer.from(responseStream.read(4)); // read 4 bytes    i.e 4+4 =8 + 4 = 12 ( prelude + prelude crc)
    msgCrcAccumulator = _bufferCrc(preludeCrcBuffer, msgCrcAccumulator);
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
      msgCrcAccumulator = _bufferCrc(headerBytes, msgCrcAccumulator);
      const headerReaderStream = (0, _helper.readableStream)(headerBytes);
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
      msgCrcAccumulator = _bufferCrc(payLoadBuffer, msgCrcAccumulator);
      // read the checksum early and detect any mismatch so we can avoid unnecessary further processing.
      const messageCrcByteValue = Buffer.from(responseStream.read(4)).readInt32BE();
      const calculatedCrc = msgCrcAccumulator.readInt32BE();
      // Handle message CRC Error
      if (messageCrcByteValue !== calculatedCrc) {
        throw new Error(`Message Checksum Mismatch, Message CRC of ${messageCrcByteValue} does not equal expected CRC of ${calculatedCrc}`);
      }
      payloadStream = (0, _helper.readableStream)(payLoadBuffer);
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
function parseLifecycleConfig(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
  return xmlObj.LifecycleConfiguration;
}
function parseBucketEncryptionConfig(xml) {
  return (0, _helper.parseXml)(xml);
}
function parseObjectRetentionConfig(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
  const retentionConfig = xmlObj.Retention;
  return {
    mode: retentionConfig.Mode,
    retainUntilDate: retentionConfig.RetainUntilDate
  };
}
function removeObjectsParser(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
  if (xmlObj.DeleteResult && xmlObj.DeleteResult.Error) {
    // return errors as array always. as the response is object in case of single object passed in removeObjects
    return (0, _helper.toArray)(xmlObj.DeleteResult.Error);
  }
  return [];
}

// parse XML response for copy object
function parseCopyObject(xml) {
  const result = {
    etag: '',
    lastModified: ''
  };
  let xmlobj = (0, _helper.parseXml)(xml);
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
function uploadPartParser(xml) {
  const xmlObj = (0, _helper.parseXml)(xml);
  const respEl = xmlObj.CopyPartResult;
  return respEl;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfYnVmZmVyQ3JjIiwicmVxdWlyZSIsIl9mYXN0WG1sUGFyc2VyIiwiZXJyb3JzIiwiX2ludGVyb3BSZXF1aXJlV2lsZGNhcmQiLCJfaGVscGVycyIsIl9oZWxwZXIiLCJfcmVzcG9uc2UiLCJfdHlwZSIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsIm5vZGVJbnRlcm9wIiwiV2Vha01hcCIsImNhY2hlQmFiZWxJbnRlcm9wIiwiY2FjaGVOb2RlSW50ZXJvcCIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiY2FjaGUiLCJoYXMiLCJnZXQiLCJuZXdPYmoiLCJoYXNQcm9wZXJ0eURlc2NyaXB0b3IiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImRlc2MiLCJzZXQiLCJwYXJzZUJ1Y2tldFJlZ2lvbiIsInhtbCIsInBhcnNlWG1sIiwiTG9jYXRpb25Db25zdHJhaW50IiwiZnhwIiwiWE1MUGFyc2VyIiwicGFyc2VFcnJvciIsImhlYWRlckluZm8iLCJ4bWxFcnIiLCJ4bWxPYmoiLCJwYXJzZSIsIkVycm9yIiwiZSIsIlMzRXJyb3IiLCJlbnRyaWVzIiwiZm9yRWFjaCIsInZhbHVlIiwidG9Mb3dlckNhc2UiLCJwYXJzZVJlc3BvbnNlRXJyb3IiLCJyZXNwb25zZSIsInN0YXR1c0NvZGUiLCJjb2RlIiwibWVzc2FnZSIsImFtelJlcXVlc3RpZCIsImhlYWRlcnMiLCJhbXpJZDIiLCJhbXpCdWNrZXRSZWdpb24iLCJ4bWxTdHJpbmciLCJyZWFkQXNTdHJpbmciLCJjYXVzZSIsInBhcnNlTGlzdE9iamVjdHNWMldpdGhNZXRhZGF0YSIsInJlc3VsdCIsIm9iamVjdHMiLCJpc1RydW5jYXRlZCIsIm5leHRDb250aW51YXRpb25Ub2tlbiIsInhtbG9iaiIsIkxpc3RCdWNrZXRSZXN1bHQiLCJJbnZhbGlkWE1MRXJyb3IiLCJJc1RydW5jYXRlZCIsIk5leHRDb250aW51YXRpb25Ub2tlbiIsIkNvbnRlbnRzIiwidG9BcnJheSIsImNvbnRlbnQiLCJuYW1lIiwic2FuaXRpemVPYmplY3RLZXkiLCJLZXkiLCJsYXN0TW9kaWZpZWQiLCJEYXRlIiwiTGFzdE1vZGlmaWVkIiwiZXRhZyIsInNhbml0aXplRVRhZyIsIkVUYWciLCJzaXplIiwiU2l6ZSIsIm1ldGFkYXRhIiwiVXNlck1ldGFkYXRhIiwicHVzaCIsIkNvbW1vblByZWZpeGVzIiwiY29tbW9uUHJlZml4IiwicHJlZml4IiwiUHJlZml4IiwicGFyc2VMaXN0UGFydHMiLCJwYXJ0cyIsIm1hcmtlciIsIkxpc3RQYXJ0c1Jlc3VsdCIsIk5leHRQYXJ0TnVtYmVyTWFya2VyIiwiUGFydCIsInAiLCJwYXJ0IiwicGFyc2VJbnQiLCJQYXJ0TnVtYmVyIiwicmVwbGFjZSIsInBhcnNlTGlzdEJ1Y2tldCIsInBhcnNlZFhtbFJlcyIsIkxpc3RBbGxNeUJ1Y2tldHNSZXN1bHQiLCJCdWNrZXRzIiwiQnVja2V0IiwibWFwIiwiYnVja2V0IiwiTmFtZSIsImJ1Y2tldE5hbWUiLCJDcmVhdGlvbkRhdGUiLCJjcmVhdGlvbkRhdGUiLCJwYXJzZUluaXRpYXRlTXVsdGlwYXJ0IiwiSW5pdGlhdGVNdWx0aXBhcnRVcGxvYWRSZXN1bHQiLCJVcGxvYWRJZCIsInBhcnNlUmVwbGljYXRpb25Db25maWciLCJSb2xlIiwiUnVsZSIsIlJlcGxpY2F0aW9uQ29uZmlndXJhdGlvbiIsInJvbGUiLCJydWxlcyIsInBhcnNlT2JqZWN0TGVnYWxIb2xkQ29uZmlnIiwiTGVnYWxIb2xkIiwicGFyc2VUYWdnaW5nIiwiVGFnZ2luZyIsIlRhZ1NldCIsIlRhZyIsInRhZ1Jlc3VsdCIsImlzT2JqZWN0IiwicGFyc2VDb21wbGV0ZU11bHRpcGFydCIsIkNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkUmVzdWx0IiwiTG9jYXRpb24iLCJsb2NhdGlvbiIsIkNvZGUiLCJNZXNzYWdlIiwiZXJyQ29kZSIsImVyck1lc3NhZ2UiLCJwYXJzZUxpc3RNdWx0aXBhcnQiLCJwcmVmaXhlcyIsInVwbG9hZHMiLCJuZXh0S2V5TWFya2VyIiwibmV4dFVwbG9hZElkTWFya2VyIiwiTGlzdE11bHRpcGFydFVwbG9hZHNSZXN1bHQiLCJOZXh0S2V5TWFya2VyIiwiTmV4dFVwbG9hZElkTWFya2VyIiwiVXBsb2FkIiwidXBsb2FkIiwidXBsb2FkSWQiLCJpbml0aWF0b3IiLCJpZCIsIkluaXRpYXRvciIsIklEIiwiZGlzcGxheU5hbWUiLCJEaXNwbGF5TmFtZSIsIm93bmVyIiwiT3duZXIiLCJzdG9yYWdlQ2xhc3MiLCJTdG9yYWdlQ2xhc3MiLCJpbml0aWF0ZWQiLCJJbml0aWF0ZWQiLCJwYXJzZU9iamVjdExvY2tDb25maWciLCJsb2NrQ29uZmlnUmVzdWx0IiwiT2JqZWN0TG9ja0NvbmZpZ3VyYXRpb24iLCJvYmplY3RMb2NrRW5hYmxlZCIsIk9iamVjdExvY2tFbmFibGVkIiwicmV0ZW50aW9uUmVzcCIsIkRlZmF1bHRSZXRlbnRpb24iLCJtb2RlIiwiTW9kZSIsImlzVW5pdFllYXJzIiwiWWVhcnMiLCJ2YWxpZGl0eSIsInVuaXQiLCJSRVRFTlRJT05fVkFMSURJVFlfVU5JVFMiLCJZRUFSUyIsIkRheXMiLCJEQVlTIiwicGFyc2VCdWNrZXRWZXJzaW9uaW5nQ29uZmlnIiwiVmVyc2lvbmluZ0NvbmZpZ3VyYXRpb24iLCJleHRyYWN0SGVhZGVyVHlwZSIsInN0cmVhbSIsImhlYWRlck5hbWVMZW4iLCJCdWZmZXIiLCJmcm9tIiwicmVhZCIsInJlYWRVSW50OCIsImhlYWRlck5hbWVXaXRoU2VwYXJhdG9yIiwidG9TdHJpbmciLCJzcGxpdEJ5U2VwYXJhdG9yIiwic3BsaXQiLCJsZW5ndGgiLCJleHRyYWN0SGVhZGVyVmFsdWUiLCJib2R5TGVuIiwicmVhZFVJbnQxNkJFIiwicGFyc2VTZWxlY3RPYmplY3RDb250ZW50UmVzcG9uc2UiLCJyZXMiLCJzZWxlY3RSZXN1bHRzIiwiU2VsZWN0UmVzdWx0cyIsInJlc3BvbnNlU3RyZWFtIiwicmVhZGFibGVTdHJlYW0iLCJfcmVhZGFibGVTdGF0ZSIsIm1zZ0NyY0FjY3VtdWxhdG9yIiwidG90YWxCeXRlTGVuZ3RoQnVmZmVyIiwiY3JjMzIiLCJoZWFkZXJCeXRlc0J1ZmZlciIsImNhbGN1bGF0ZWRQcmVsdWRlQ3JjIiwicmVhZEludDMyQkUiLCJwcmVsdWRlQ3JjQnVmZmVyIiwidG90YWxNc2dMZW5ndGgiLCJoZWFkZXJMZW5ndGgiLCJwcmVsdWRlQ3JjQnl0ZVZhbHVlIiwiaGVhZGVyQnl0ZXMiLCJoZWFkZXJSZWFkZXJTdHJlYW0iLCJoZWFkZXJUeXBlTmFtZSIsInBheWxvYWRTdHJlYW0iLCJwYXlMb2FkTGVuZ3RoIiwicGF5TG9hZEJ1ZmZlciIsIm1lc3NhZ2VDcmNCeXRlVmFsdWUiLCJjYWxjdWxhdGVkQ3JjIiwibWVzc2FnZVR5cGUiLCJlcnJvck1lc3NhZ2UiLCJjb250ZW50VHlwZSIsImV2ZW50VHlwZSIsInNldFJlc3BvbnNlIiwiX3BheWxvYWRTdHJlYW0iLCJyZWFkRGF0YSIsInNldFJlY29yZHMiLCJfcGF5bG9hZFN0cmVhbTIiLCJwcm9ncmVzc0RhdGEiLCJzZXRQcm9ncmVzcyIsIl9wYXlsb2FkU3RyZWFtMyIsInN0YXRzRGF0YSIsInNldFN0YXRzIiwid2FybmluZ01lc3NhZ2UiLCJjb25zb2xlIiwid2FybiIsInBhcnNlTGlmZWN5Y2xlQ29uZmlnIiwiTGlmZWN5Y2xlQ29uZmlndXJhdGlvbiIsInBhcnNlQnVja2V0RW5jcnlwdGlvbkNvbmZpZyIsInBhcnNlT2JqZWN0UmV0ZW50aW9uQ29uZmlnIiwicmV0ZW50aW9uQ29uZmlnIiwiUmV0ZW50aW9uIiwicmV0YWluVW50aWxEYXRlIiwiUmV0YWluVW50aWxEYXRlIiwicmVtb3ZlT2JqZWN0c1BhcnNlciIsIkRlbGV0ZVJlc3VsdCIsInBhcnNlQ29weU9iamVjdCIsIkNvcHlPYmplY3RSZXN1bHQiLCJ1cGxvYWRQYXJ0UGFyc2VyIiwicmVzcEVsIiwiQ29weVBhcnRSZXN1bHQiXSwic291cmNlcyI6WyJ4bWwtcGFyc2VyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlICogYXMgaHR0cCBmcm9tICdub2RlOmh0dHAnXG5pbXBvcnQgdHlwZSBzdHJlYW0gZnJvbSAnbm9kZTpzdHJlYW0nXG5cbmltcG9ydCBjcmMzMiBmcm9tICdidWZmZXItY3JjMzInXG5pbXBvcnQgeyBYTUxQYXJzZXIgfSBmcm9tICdmYXN0LXhtbC1wYXJzZXInXG5cbmltcG9ydCAqIGFzIGVycm9ycyBmcm9tICcuLi9lcnJvcnMudHMnXG5pbXBvcnQgeyBTZWxlY3RSZXN1bHRzIH0gZnJvbSAnLi4vaGVscGVycy50cydcbmltcG9ydCB7IGlzT2JqZWN0LCBwYXJzZVhtbCwgcmVhZGFibGVTdHJlYW0sIHNhbml0aXplRVRhZywgc2FuaXRpemVPYmplY3RLZXksIHRvQXJyYXkgfSBmcm9tICcuL2hlbHBlci50cydcbmltcG9ydCB7IHJlYWRBc1N0cmluZyB9IGZyb20gJy4vcmVzcG9uc2UudHMnXG5pbXBvcnQgdHlwZSB7XG4gIEJ1Y2tldEl0ZW1Gcm9tTGlzdCxcbiAgQnVja2V0SXRlbVdpdGhNZXRhZGF0YSxcbiAgQ29weU9iamVjdFJlc3VsdFYxLFxuICBPYmplY3RMb2NrSW5mbyxcbiAgUmVwbGljYXRpb25Db25maWcsXG59IGZyb20gJy4vdHlwZS50cydcbmltcG9ydCB7IFJFVEVOVElPTl9WQUxJRElUWV9VTklUUyB9IGZyb20gJy4vdHlwZS50cydcblxuLy8gcGFyc2UgWE1MIHJlc3BvbnNlIGZvciBidWNrZXQgcmVnaW9uXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VCdWNrZXRSZWdpb24oeG1sOiBzdHJpbmcpOiBzdHJpbmcge1xuICAvLyByZXR1cm4gcmVnaW9uIGluZm9ybWF0aW9uXG4gIHJldHVybiBwYXJzZVhtbCh4bWwpLkxvY2F0aW9uQ29uc3RyYWludFxufVxuXG5jb25zdCBmeHAgPSBuZXcgWE1MUGFyc2VyKClcblxuLy8gUGFyc2UgWE1MIGFuZCByZXR1cm4gaW5mb3JtYXRpb24gYXMgSmF2YXNjcmlwdCB0eXBlc1xuLy8gcGFyc2UgZXJyb3IgWE1MIHJlc3BvbnNlXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VFcnJvcih4bWw6IHN0cmluZywgaGVhZGVySW5mbzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIHtcbiAgbGV0IHhtbEVyciA9IHt9XG4gIGNvbnN0IHhtbE9iaiA9IGZ4cC5wYXJzZSh4bWwpXG4gIGlmICh4bWxPYmouRXJyb3IpIHtcbiAgICB4bWxFcnIgPSB4bWxPYmouRXJyb3JcbiAgfVxuICBjb25zdCBlID0gbmV3IGVycm9ycy5TM0Vycm9yKCkgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPlxuICBPYmplY3QuZW50cmllcyh4bWxFcnIpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgIGVba2V5LnRvTG93ZXJDYXNlKCldID0gdmFsdWVcbiAgfSlcbiAgT2JqZWN0LmVudHJpZXMoaGVhZGVySW5mbykuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiB7XG4gICAgZVtrZXldID0gdmFsdWVcbiAgfSlcbiAgcmV0dXJuIGVcbn1cblxuLy8gR2VuZXJhdGVzIGFuIEVycm9yIG9iamVjdCBkZXBlbmRpbmcgb24gaHR0cCBzdGF0dXNDb2RlIGFuZCBYTUwgYm9keVxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlUmVzcG9uc2VFcnJvcihyZXNwb25zZTogaHR0cC5JbmNvbWluZ01lc3NhZ2UpIHtcbiAgY29uc3Qgc3RhdHVzQ29kZSA9IHJlc3BvbnNlLnN0YXR1c0NvZGVcbiAgbGV0IGNvZGU6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nXG4gIGlmIChzdGF0dXNDb2RlID09PSAzMDEpIHtcbiAgICBjb2RlID0gJ01vdmVkUGVybWFuZW50bHknXG4gICAgbWVzc2FnZSA9ICdNb3ZlZCBQZXJtYW5lbnRseSdcbiAgfSBlbHNlIGlmIChzdGF0dXNDb2RlID09PSAzMDcpIHtcbiAgICBjb2RlID0gJ1RlbXBvcmFyeVJlZGlyZWN0J1xuICAgIG1lc3NhZ2UgPSAnQXJlIHlvdSB1c2luZyB0aGUgY29ycmVjdCBlbmRwb2ludCBVUkw/J1xuICB9IGVsc2UgaWYgKHN0YXR1c0NvZGUgPT09IDQwMykge1xuICAgIGNvZGUgPSAnQWNjZXNzRGVuaWVkJ1xuICAgIG1lc3NhZ2UgPSAnVmFsaWQgYW5kIGF1dGhvcml6ZWQgY3JlZGVudGlhbHMgcmVxdWlyZWQnXG4gIH0gZWxzZSBpZiAoc3RhdHVzQ29kZSA9PT0gNDA0KSB7XG4gICAgY29kZSA9ICdOb3RGb3VuZCdcbiAgICBtZXNzYWdlID0gJ05vdCBGb3VuZCdcbiAgfSBlbHNlIGlmIChzdGF0dXNDb2RlID09PSA0MDUpIHtcbiAgICBjb2RlID0gJ01ldGhvZE5vdEFsbG93ZWQnXG4gICAgbWVzc2FnZSA9ICdNZXRob2QgTm90IEFsbG93ZWQnXG4gIH0gZWxzZSBpZiAoc3RhdHVzQ29kZSA9PT0gNTAxKSB7XG4gICAgY29kZSA9ICdNZXRob2ROb3RBbGxvd2VkJ1xuICAgIG1lc3NhZ2UgPSAnTWV0aG9kIE5vdCBBbGxvd2VkJ1xuICB9IGVsc2Uge1xuICAgIGNvZGUgPSAnVW5rbm93bkVycm9yJ1xuICAgIG1lc3NhZ2UgPSBgJHtzdGF0dXNDb2RlfWBcbiAgfVxuICBjb25zdCBoZWFkZXJJbmZvOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsPiA9IHt9XG4gIC8vIEEgdmFsdWUgY3JlYXRlZCBieSBTMyBjb21wYXRpYmxlIHNlcnZlciB0aGF0IHVuaXF1ZWx5IGlkZW50aWZpZXMgdGhlIHJlcXVlc3QuXG4gIGhlYWRlckluZm8uYW16UmVxdWVzdGlkID0gcmVzcG9uc2UuaGVhZGVyc1sneC1hbXotcmVxdWVzdC1pZCddIGFzIHN0cmluZyB8IHVuZGVmaW5lZFxuICAvLyBBIHNwZWNpYWwgdG9rZW4gdGhhdCBoZWxwcyB0cm91Ymxlc2hvb3QgQVBJIHJlcGxpZXMgYW5kIGlzc3Vlcy5cbiAgaGVhZGVySW5mby5hbXpJZDIgPSByZXNwb25zZS5oZWFkZXJzWyd4LWFtei1pZC0yJ10gYXMgc3RyaW5nIHwgdW5kZWZpbmVkXG5cbiAgLy8gUmVnaW9uIHdoZXJlIHRoZSBidWNrZXQgaXMgbG9jYXRlZC4gVGhpcyBoZWFkZXIgaXMgcmV0dXJuZWQgb25seVxuICAvLyBpbiBIRUFEIGJ1Y2tldCBhbmQgTGlzdE9iamVjdHMgcmVzcG9uc2UuXG4gIGhlYWRlckluZm8uYW16QnVja2V0UmVnaW9uID0gcmVzcG9uc2UuaGVhZGVyc1sneC1hbXotYnVja2V0LXJlZ2lvbiddIGFzIHN0cmluZyB8IHVuZGVmaW5lZFxuXG4gIGNvbnN0IHhtbFN0cmluZyA9IGF3YWl0IHJlYWRBc1N0cmluZyhyZXNwb25zZSlcblxuICBpZiAoeG1sU3RyaW5nKSB7XG4gICAgdGhyb3cgcGFyc2VFcnJvcih4bWxTdHJpbmcsIGhlYWRlckluZm8pXG4gIH1cblxuICAvLyBNZXNzYWdlIHNob3VsZCBiZSBpbnN0YW50aWF0ZWQgZm9yIGVhY2ggUzNFcnJvcnMuXG4gIGNvbnN0IGUgPSBuZXcgZXJyb3JzLlMzRXJyb3IobWVzc2FnZSwgeyBjYXVzZTogaGVhZGVySW5mbyB9KVxuICAvLyBTMyBFcnJvciBjb2RlLlxuICBlLmNvZGUgPSBjb2RlXG4gIE9iamVjdC5lbnRyaWVzKGhlYWRlckluZm8pLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgZm9yY2Ugc2V0IGVycm9yIHByb3BlcnRpZXNcbiAgICBlW2tleV0gPSB2YWx1ZVxuICB9KVxuXG4gIHRocm93IGVcbn1cblxuLyoqXG4gKiBwYXJzZSBYTUwgcmVzcG9uc2UgZm9yIGxpc3Qgb2JqZWN0cyB2MiB3aXRoIG1ldGFkYXRhIGluIGEgYnVja2V0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUxpc3RPYmplY3RzVjJXaXRoTWV0YWRhdGEoeG1sOiBzdHJpbmcpIHtcbiAgY29uc3QgcmVzdWx0OiB7XG4gICAgb2JqZWN0czogQXJyYXk8QnVja2V0SXRlbVdpdGhNZXRhZGF0YT5cbiAgICBpc1RydW5jYXRlZDogYm9vbGVhblxuICAgIG5leHRDb250aW51YXRpb25Ub2tlbjogc3RyaW5nXG4gIH0gPSB7XG4gICAgb2JqZWN0czogW10sXG4gICAgaXNUcnVuY2F0ZWQ6IGZhbHNlLFxuICAgIG5leHRDb250aW51YXRpb25Ub2tlbjogJycsXG4gIH1cblxuICBsZXQgeG1sb2JqID0gcGFyc2VYbWwoeG1sKVxuICBpZiAoIXhtbG9iai5MaXN0QnVja2V0UmVzdWx0KSB7XG4gICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkWE1MRXJyb3IoJ01pc3NpbmcgdGFnOiBcIkxpc3RCdWNrZXRSZXN1bHRcIicpXG4gIH1cbiAgeG1sb2JqID0geG1sb2JqLkxpc3RCdWNrZXRSZXN1bHRcbiAgaWYgKHhtbG9iai5Jc1RydW5jYXRlZCkge1xuICAgIHJlc3VsdC5pc1RydW5jYXRlZCA9IHhtbG9iai5Jc1RydW5jYXRlZFxuICB9XG4gIGlmICh4bWxvYmouTmV4dENvbnRpbnVhdGlvblRva2VuKSB7XG4gICAgcmVzdWx0Lm5leHRDb250aW51YXRpb25Ub2tlbiA9IHhtbG9iai5OZXh0Q29udGludWF0aW9uVG9rZW5cbiAgfVxuXG4gIGlmICh4bWxvYmouQ29udGVudHMpIHtcbiAgICB0b0FycmF5KHhtbG9iai5Db250ZW50cykuZm9yRWFjaCgoY29udGVudCkgPT4ge1xuICAgICAgY29uc3QgbmFtZSA9IHNhbml0aXplT2JqZWN0S2V5KGNvbnRlbnQuS2V5KVxuICAgICAgY29uc3QgbGFzdE1vZGlmaWVkID0gbmV3IERhdGUoY29udGVudC5MYXN0TW9kaWZpZWQpXG4gICAgICBjb25zdCBldGFnID0gc2FuaXRpemVFVGFnKGNvbnRlbnQuRVRhZylcbiAgICAgIGNvbnN0IHNpemUgPSBjb250ZW50LlNpemVcbiAgICAgIGxldCBtZXRhZGF0YVxuICAgICAgaWYgKGNvbnRlbnQuVXNlck1ldGFkYXRhICE9IG51bGwpIHtcbiAgICAgICAgbWV0YWRhdGEgPSB0b0FycmF5KGNvbnRlbnQuVXNlck1ldGFkYXRhKVswXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWV0YWRhdGEgPSBudWxsXG4gICAgICB9XG4gICAgICByZXN1bHQub2JqZWN0cy5wdXNoKHsgbmFtZSwgbGFzdE1vZGlmaWVkLCBldGFnLCBzaXplLCBtZXRhZGF0YSB9KVxuICAgIH0pXG4gIH1cblxuICBpZiAoeG1sb2JqLkNvbW1vblByZWZpeGVzKSB7XG4gICAgdG9BcnJheSh4bWxvYmouQ29tbW9uUHJlZml4ZXMpLmZvckVhY2goKGNvbW1vblByZWZpeCkgPT4ge1xuICAgICAgcmVzdWx0Lm9iamVjdHMucHVzaCh7IHByZWZpeDogc2FuaXRpemVPYmplY3RLZXkodG9BcnJheShjb21tb25QcmVmaXguUHJlZml4KVswXSksIHNpemU6IDAgfSlcbiAgICB9KVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZXhwb3J0IHR5cGUgTXVsdGlwYXJ0ID0ge1xuICB1cGxvYWRzOiBBcnJheTx7XG4gICAga2V5OiBzdHJpbmdcbiAgICB1cGxvYWRJZDogc3RyaW5nXG4gICAgaW5pdGlhdG9yOiB1bmtub3duXG4gICAgb3duZXI6IHVua25vd25cbiAgICBzdG9yYWdlQ2xhc3M6IHVua25vd25cbiAgICBpbml0aWF0ZWQ6IHVua25vd25cbiAgfT5cbiAgcHJlZml4ZXM6IHtcbiAgICBwcmVmaXg6IHN0cmluZ1xuICB9W11cbiAgaXNUcnVuY2F0ZWQ6IGJvb2xlYW5cbiAgbmV4dEtleU1hcmtlcjogdW5kZWZpbmVkXG4gIG5leHRVcGxvYWRJZE1hcmtlcjogdW5kZWZpbmVkXG59XG5cbmV4cG9ydCB0eXBlIFVwbG9hZGVkUGFydCA9IHtcbiAgcGFydDogbnVtYmVyXG4gIGxhc3RNb2RpZmllZD86IERhdGVcbiAgZXRhZzogc3RyaW5nXG4gIHNpemU6IG51bWJlclxufVxuXG4vLyBwYXJzZSBYTUwgcmVzcG9uc2UgZm9yIGxpc3QgcGFydHMgb2YgYW4gaW4gcHJvZ3Jlc3MgbXVsdGlwYXJ0IHVwbG9hZFxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTGlzdFBhcnRzKHhtbDogc3RyaW5nKToge1xuICBpc1RydW5jYXRlZDogYm9vbGVhblxuICBtYXJrZXI6IG51bWJlclxuICBwYXJ0czogVXBsb2FkZWRQYXJ0W11cbn0ge1xuICBsZXQgeG1sb2JqID0gcGFyc2VYbWwoeG1sKVxuICBjb25zdCByZXN1bHQ6IHtcbiAgICBpc1RydW5jYXRlZDogYm9vbGVhblxuICAgIG1hcmtlcjogbnVtYmVyXG4gICAgcGFydHM6IFVwbG9hZGVkUGFydFtdXG4gIH0gPSB7XG4gICAgaXNUcnVuY2F0ZWQ6IGZhbHNlLFxuICAgIHBhcnRzOiBbXSxcbiAgICBtYXJrZXI6IDAsXG4gIH1cbiAgaWYgKCF4bWxvYmouTGlzdFBhcnRzUmVzdWx0KSB7XG4gICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkWE1MRXJyb3IoJ01pc3NpbmcgdGFnOiBcIkxpc3RQYXJ0c1Jlc3VsdFwiJylcbiAgfVxuICB4bWxvYmogPSB4bWxvYmouTGlzdFBhcnRzUmVzdWx0XG4gIGlmICh4bWxvYmouSXNUcnVuY2F0ZWQpIHtcbiAgICByZXN1bHQuaXNUcnVuY2F0ZWQgPSB4bWxvYmouSXNUcnVuY2F0ZWRcbiAgfVxuICBpZiAoeG1sb2JqLk5leHRQYXJ0TnVtYmVyTWFya2VyKSB7XG4gICAgcmVzdWx0Lm1hcmtlciA9IHRvQXJyYXkoeG1sb2JqLk5leHRQYXJ0TnVtYmVyTWFya2VyKVswXSB8fCAnJ1xuICB9XG4gIGlmICh4bWxvYmouUGFydCkge1xuICAgIHRvQXJyYXkoeG1sb2JqLlBhcnQpLmZvckVhY2goKHApID0+IHtcbiAgICAgIGNvbnN0IHBhcnQgPSBwYXJzZUludCh0b0FycmF5KHAuUGFydE51bWJlcilbMF0sIDEwKVxuICAgICAgY29uc3QgbGFzdE1vZGlmaWVkID0gbmV3IERhdGUocC5MYXN0TW9kaWZpZWQpXG4gICAgICBjb25zdCBldGFnID0gcC5FVGFnLnJlcGxhY2UoL15cIi9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoL1wiJC9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoL14mcXVvdDsvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC8mcXVvdDskL2csICcnKVxuICAgICAgICAucmVwbGFjZSgvXiYjMzQ7L2csICcnKVxuICAgICAgICAucmVwbGFjZSgvJiMzNDskL2csICcnKVxuICAgICAgcmVzdWx0LnBhcnRzLnB1c2goeyBwYXJ0LCBsYXN0TW9kaWZpZWQsIGV0YWcsIHNpemU6IHBhcnNlSW50KHAuU2l6ZSwgMTApIH0pXG4gICAgfSlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUxpc3RCdWNrZXQoeG1sOiBzdHJpbmcpIHtcbiAgbGV0IHJlc3VsdDogQnVja2V0SXRlbUZyb21MaXN0W10gPSBbXVxuICBjb25zdCBwYXJzZWRYbWxSZXMgPSBwYXJzZVhtbCh4bWwpXG5cbiAgaWYgKCFwYXJzZWRYbWxSZXMuTGlzdEFsbE15QnVja2V0c1Jlc3VsdCkge1xuICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZFhNTEVycm9yKCdNaXNzaW5nIHRhZzogXCJMaXN0QWxsTXlCdWNrZXRzUmVzdWx0XCInKVxuICB9XG4gIGNvbnN0IHsgTGlzdEFsbE15QnVja2V0c1Jlc3VsdDogeyBCdWNrZXRzID0ge30gfSA9IHt9IH0gPSBwYXJzZWRYbWxSZXNcblxuICBpZiAoQnVja2V0cy5CdWNrZXQpIHtcbiAgICByZXN1bHQgPSB0b0FycmF5KEJ1Y2tldHMuQnVja2V0KS5tYXAoKGJ1Y2tldCA9IHt9KSA9PiB7XG4gICAgICBjb25zdCB7IE5hbWU6IGJ1Y2tldE5hbWUsIENyZWF0aW9uRGF0ZSB9ID0gYnVja2V0XG4gICAgICBjb25zdCBjcmVhdGlvbkRhdGUgPSBuZXcgRGF0ZShDcmVhdGlvbkRhdGUpXG5cbiAgICAgIHJldHVybiB7IG5hbWU6IGJ1Y2tldE5hbWUsIGNyZWF0aW9uRGF0ZTogY3JlYXRpb25EYXRlIH1cbiAgICB9KVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlSW5pdGlhdGVNdWx0aXBhcnQoeG1sOiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgeG1sb2JqID0gcGFyc2VYbWwoeG1sKVxuXG4gIGlmICgheG1sb2JqLkluaXRpYXRlTXVsdGlwYXJ0VXBsb2FkUmVzdWx0KSB7XG4gICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkWE1MRXJyb3IoJ01pc3NpbmcgdGFnOiBcIkluaXRpYXRlTXVsdGlwYXJ0VXBsb2FkUmVzdWx0XCInKVxuICB9XG4gIHhtbG9iaiA9IHhtbG9iai5Jbml0aWF0ZU11bHRpcGFydFVwbG9hZFJlc3VsdFxuXG4gIGlmICh4bWxvYmouVXBsb2FkSWQpIHtcbiAgICByZXR1cm4geG1sb2JqLlVwbG9hZElkXG4gIH1cbiAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkWE1MRXJyb3IoJ01pc3NpbmcgdGFnOiBcIlVwbG9hZElkXCInKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VSZXBsaWNhdGlvbkNvbmZpZyh4bWw6IHN0cmluZyk6IFJlcGxpY2F0aW9uQ29uZmlnIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICBjb25zdCB7IFJvbGUsIFJ1bGUgfSA9IHhtbE9iai5SZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb25cbiAgcmV0dXJuIHtcbiAgICBSZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb246IHtcbiAgICAgIHJvbGU6IFJvbGUsXG4gICAgICBydWxlczogdG9BcnJheShSdWxlKSxcbiAgICB9LFxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU9iamVjdExlZ2FsSG9sZENvbmZpZyh4bWw6IHN0cmluZykge1xuICBjb25zdCB4bWxPYmogPSBwYXJzZVhtbCh4bWwpXG4gIHJldHVybiB4bWxPYmouTGVnYWxIb2xkXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVRhZ2dpbmcoeG1sOiBzdHJpbmcpIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICBsZXQgcmVzdWx0ID0gW11cbiAgaWYgKHhtbE9iai5UYWdnaW5nICYmIHhtbE9iai5UYWdnaW5nLlRhZ1NldCAmJiB4bWxPYmouVGFnZ2luZy5UYWdTZXQuVGFnKSB7XG4gICAgY29uc3QgdGFnUmVzdWx0ID0geG1sT2JqLlRhZ2dpbmcuVGFnU2V0LlRhZ1xuICAgIC8vIGlmIGl0IGlzIGEgc2luZ2xlIHRhZyBjb252ZXJ0IGludG8gYW4gYXJyYXkgc28gdGhhdCB0aGUgcmV0dXJuIHZhbHVlIGlzIGFsd2F5cyBhbiBhcnJheS5cbiAgICBpZiAoaXNPYmplY3QodGFnUmVzdWx0KSkge1xuICAgICAgcmVzdWx0LnB1c2godGFnUmVzdWx0KVxuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQgPSB0YWdSZXN1bHRcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBwYXJzZSBYTUwgcmVzcG9uc2Ugd2hlbiBhIG11bHRpcGFydCB1cGxvYWQgaXMgY29tcGxldGVkXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VDb21wbGV0ZU11bHRpcGFydCh4bWw6IHN0cmluZykge1xuICBjb25zdCB4bWxvYmogPSBwYXJzZVhtbCh4bWwpLkNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkUmVzdWx0XG4gIGlmICh4bWxvYmouTG9jYXRpb24pIHtcbiAgICBjb25zdCBsb2NhdGlvbiA9IHRvQXJyYXkoeG1sb2JqLkxvY2F0aW9uKVswXVxuICAgIGNvbnN0IGJ1Y2tldCA9IHRvQXJyYXkoeG1sb2JqLkJ1Y2tldClbMF1cbiAgICBjb25zdCBrZXkgPSB4bWxvYmouS2V5XG4gICAgY29uc3QgZXRhZyA9IHhtbG9iai5FVGFnLnJlcGxhY2UoL15cIi9nLCAnJylcbiAgICAgIC5yZXBsYWNlKC9cIiQvZywgJycpXG4gICAgICAucmVwbGFjZSgvXiZxdW90Oy9nLCAnJylcbiAgICAgIC5yZXBsYWNlKC8mcXVvdDskL2csICcnKVxuICAgICAgLnJlcGxhY2UoL14mIzM0Oy9nLCAnJylcbiAgICAgIC5yZXBsYWNlKC8mIzM0OyQvZywgJycpXG5cbiAgICByZXR1cm4geyBsb2NhdGlvbiwgYnVja2V0LCBrZXksIGV0YWcgfVxuICB9XG4gIC8vIENvbXBsZXRlIE11bHRpcGFydCBjYW4gcmV0dXJuIFhNTCBFcnJvciBhZnRlciBhIDIwMCBPSyByZXNwb25zZVxuICBpZiAoeG1sb2JqLkNvZGUgJiYgeG1sb2JqLk1lc3NhZ2UpIHtcbiAgICBjb25zdCBlcnJDb2RlID0gdG9BcnJheSh4bWxvYmouQ29kZSlbMF1cbiAgICBjb25zdCBlcnJNZXNzYWdlID0gdG9BcnJheSh4bWxvYmouTWVzc2FnZSlbMF1cbiAgICByZXR1cm4geyBlcnJDb2RlLCBlcnJNZXNzYWdlIH1cbiAgfVxufVxuXG50eXBlIFVwbG9hZElEID0gc3RyaW5nXG5cbmV4cG9ydCB0eXBlIExpc3RNdWx0aXBhcnRSZXN1bHQgPSB7XG4gIHVwbG9hZHM6IHtcbiAgICBrZXk6IHN0cmluZ1xuICAgIHVwbG9hZElkOiBVcGxvYWRJRFxuICAgIGluaXRpYXRvcjogdW5rbm93blxuICAgIG93bmVyOiB1bmtub3duXG4gICAgc3RvcmFnZUNsYXNzOiB1bmtub3duXG4gICAgaW5pdGlhdGVkOiBEYXRlXG4gIH1bXVxuICBwcmVmaXhlczoge1xuICAgIHByZWZpeDogc3RyaW5nXG4gIH1bXVxuICBpc1RydW5jYXRlZDogYm9vbGVhblxuICBuZXh0S2V5TWFya2VyOiBzdHJpbmdcbiAgbmV4dFVwbG9hZElkTWFya2VyOiBzdHJpbmdcbn1cblxuLy8gcGFyc2UgWE1MIHJlc3BvbnNlIGZvciBsaXN0aW5nIGluLXByb2dyZXNzIG11bHRpcGFydCB1cGxvYWRzXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VMaXN0TXVsdGlwYXJ0KHhtbDogc3RyaW5nKTogTGlzdE11bHRpcGFydFJlc3VsdCB7XG4gIGNvbnN0IHJlc3VsdDogTGlzdE11bHRpcGFydFJlc3VsdCA9IHtcbiAgICBwcmVmaXhlczogW10sXG4gICAgdXBsb2FkczogW10sXG4gICAgaXNUcnVuY2F0ZWQ6IGZhbHNlLFxuICAgIG5leHRLZXlNYXJrZXI6ICcnLFxuICAgIG5leHRVcGxvYWRJZE1hcmtlcjogJycsXG4gIH1cblxuICBsZXQgeG1sb2JqID0gcGFyc2VYbWwoeG1sKVxuXG4gIGlmICgheG1sb2JqLkxpc3RNdWx0aXBhcnRVcGxvYWRzUmVzdWx0KSB7XG4gICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkWE1MRXJyb3IoJ01pc3NpbmcgdGFnOiBcIkxpc3RNdWx0aXBhcnRVcGxvYWRzUmVzdWx0XCInKVxuICB9XG4gIHhtbG9iaiA9IHhtbG9iai5MaXN0TXVsdGlwYXJ0VXBsb2Fkc1Jlc3VsdFxuICBpZiAoeG1sb2JqLklzVHJ1bmNhdGVkKSB7XG4gICAgcmVzdWx0LmlzVHJ1bmNhdGVkID0geG1sb2JqLklzVHJ1bmNhdGVkXG4gIH1cbiAgaWYgKHhtbG9iai5OZXh0S2V5TWFya2VyKSB7XG4gICAgcmVzdWx0Lm5leHRLZXlNYXJrZXIgPSB4bWxvYmouTmV4dEtleU1hcmtlclxuICB9XG4gIGlmICh4bWxvYmouTmV4dFVwbG9hZElkTWFya2VyKSB7XG4gICAgcmVzdWx0Lm5leHRVcGxvYWRJZE1hcmtlciA9IHhtbG9iai5uZXh0VXBsb2FkSWRNYXJrZXIgfHwgJydcbiAgfVxuXG4gIGlmICh4bWxvYmouQ29tbW9uUHJlZml4ZXMpIHtcbiAgICB0b0FycmF5KHhtbG9iai5Db21tb25QcmVmaXhlcykuZm9yRWFjaCgocHJlZml4KSA9PiB7XG4gICAgICAvLyBAdHMtZXhwZWN0LWVycm9yIGluZGV4IGNoZWNrXG4gICAgICByZXN1bHQucHJlZml4ZXMucHVzaCh7IHByZWZpeDogc2FuaXRpemVPYmplY3RLZXkodG9BcnJheTxzdHJpbmc+KHByZWZpeC5QcmVmaXgpWzBdKSB9KVxuICAgIH0pXG4gIH1cblxuICBpZiAoeG1sb2JqLlVwbG9hZCkge1xuICAgIHRvQXJyYXkoeG1sb2JqLlVwbG9hZCkuZm9yRWFjaCgodXBsb2FkKSA9PiB7XG4gICAgICBjb25zdCBrZXkgPSB1cGxvYWQuS2V5XG4gICAgICBjb25zdCB1cGxvYWRJZCA9IHVwbG9hZC5VcGxvYWRJZFxuICAgICAgY29uc3QgaW5pdGlhdG9yID0geyBpZDogdXBsb2FkLkluaXRpYXRvci5JRCwgZGlzcGxheU5hbWU6IHVwbG9hZC5Jbml0aWF0b3IuRGlzcGxheU5hbWUgfVxuICAgICAgY29uc3Qgb3duZXIgPSB7IGlkOiB1cGxvYWQuT3duZXIuSUQsIGRpc3BsYXlOYW1lOiB1cGxvYWQuT3duZXIuRGlzcGxheU5hbWUgfVxuICAgICAgY29uc3Qgc3RvcmFnZUNsYXNzID0gdXBsb2FkLlN0b3JhZ2VDbGFzc1xuICAgICAgY29uc3QgaW5pdGlhdGVkID0gbmV3IERhdGUodXBsb2FkLkluaXRpYXRlZClcbiAgICAgIHJlc3VsdC51cGxvYWRzLnB1c2goeyBrZXksIHVwbG9hZElkLCBpbml0aWF0b3IsIG93bmVyLCBzdG9yYWdlQ2xhc3MsIGluaXRpYXRlZCB9KVxuICAgIH0pXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VPYmplY3RMb2NrQ29uZmlnKHhtbDogc3RyaW5nKTogT2JqZWN0TG9ja0luZm8ge1xuICBjb25zdCB4bWxPYmogPSBwYXJzZVhtbCh4bWwpXG4gIGxldCBsb2NrQ29uZmlnUmVzdWx0ID0ge30gYXMgT2JqZWN0TG9ja0luZm9cbiAgaWYgKHhtbE9iai5PYmplY3RMb2NrQ29uZmlndXJhdGlvbikge1xuICAgIGxvY2tDb25maWdSZXN1bHQgPSB7XG4gICAgICBvYmplY3RMb2NrRW5hYmxlZDogeG1sT2JqLk9iamVjdExvY2tDb25maWd1cmF0aW9uLk9iamVjdExvY2tFbmFibGVkLFxuICAgIH0gYXMgT2JqZWN0TG9ja0luZm9cbiAgICBsZXQgcmV0ZW50aW9uUmVzcFxuICAgIGlmIChcbiAgICAgIHhtbE9iai5PYmplY3RMb2NrQ29uZmlndXJhdGlvbiAmJlxuICAgICAgeG1sT2JqLk9iamVjdExvY2tDb25maWd1cmF0aW9uLlJ1bGUgJiZcbiAgICAgIHhtbE9iai5PYmplY3RMb2NrQ29uZmlndXJhdGlvbi5SdWxlLkRlZmF1bHRSZXRlbnRpb25cbiAgICApIHtcbiAgICAgIHJldGVudGlvblJlc3AgPSB4bWxPYmouT2JqZWN0TG9ja0NvbmZpZ3VyYXRpb24uUnVsZS5EZWZhdWx0UmV0ZW50aW9uIHx8IHt9XG4gICAgICBsb2NrQ29uZmlnUmVzdWx0Lm1vZGUgPSByZXRlbnRpb25SZXNwLk1vZGVcbiAgICB9XG4gICAgaWYgKHJldGVudGlvblJlc3ApIHtcbiAgICAgIGNvbnN0IGlzVW5pdFllYXJzID0gcmV0ZW50aW9uUmVzcC5ZZWFyc1xuICAgICAgaWYgKGlzVW5pdFllYXJzKSB7XG4gICAgICAgIGxvY2tDb25maWdSZXN1bHQudmFsaWRpdHkgPSBpc1VuaXRZZWFyc1xuICAgICAgICBsb2NrQ29uZmlnUmVzdWx0LnVuaXQgPSBSRVRFTlRJT05fVkFMSURJVFlfVU5JVFMuWUVBUlNcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvY2tDb25maWdSZXN1bHQudmFsaWRpdHkgPSByZXRlbnRpb25SZXNwLkRheXNcbiAgICAgICAgbG9ja0NvbmZpZ1Jlc3VsdC51bml0ID0gUkVURU5USU9OX1ZBTElESVRZX1VOSVRTLkRBWVNcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gbG9ja0NvbmZpZ1Jlc3VsdFxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VCdWNrZXRWZXJzaW9uaW5nQ29uZmlnKHhtbDogc3RyaW5nKSB7XG4gIGNvbnN0IHhtbE9iaiA9IHBhcnNlWG1sKHhtbClcbiAgcmV0dXJuIHhtbE9iai5WZXJzaW9uaW5nQ29uZmlndXJhdGlvblxufVxuXG4vLyBVc2VkIG9ubHkgaW4gc2VsZWN0T2JqZWN0Q29udGVudCBBUEkuXG4vLyBleHRyYWN0SGVhZGVyVHlwZSBleHRyYWN0cyB0aGUgZmlyc3QgaGFsZiBvZiB0aGUgaGVhZGVyIG1lc3NhZ2UsIHRoZSBoZWFkZXIgdHlwZS5cbmZ1bmN0aW9uIGV4dHJhY3RIZWFkZXJUeXBlKHN0cmVhbTogc3RyZWFtLlJlYWRhYmxlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgaGVhZGVyTmFtZUxlbiA9IEJ1ZmZlci5mcm9tKHN0cmVhbS5yZWFkKDEpKS5yZWFkVUludDgoKVxuICBjb25zdCBoZWFkZXJOYW1lV2l0aFNlcGFyYXRvciA9IEJ1ZmZlci5mcm9tKHN0cmVhbS5yZWFkKGhlYWRlck5hbWVMZW4pKS50b1N0cmluZygpXG4gIGNvbnN0IHNwbGl0QnlTZXBhcmF0b3IgPSAoaGVhZGVyTmFtZVdpdGhTZXBhcmF0b3IgfHwgJycpLnNwbGl0KCc6JylcbiAgcmV0dXJuIHNwbGl0QnlTZXBhcmF0b3IubGVuZ3RoID49IDEgPyBzcGxpdEJ5U2VwYXJhdG9yWzFdIDogJydcbn1cblxuZnVuY3Rpb24gZXh0cmFjdEhlYWRlclZhbHVlKHN0cmVhbTogc3RyZWFtLlJlYWRhYmxlKSB7XG4gIGNvbnN0IGJvZHlMZW4gPSBCdWZmZXIuZnJvbShzdHJlYW0ucmVhZCgyKSkucmVhZFVJbnQxNkJFKClcbiAgcmV0dXJuIEJ1ZmZlci5mcm9tKHN0cmVhbS5yZWFkKGJvZHlMZW4pKS50b1N0cmluZygpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVNlbGVjdE9iamVjdENvbnRlbnRSZXNwb25zZShyZXM6IEJ1ZmZlcikge1xuICBjb25zdCBzZWxlY3RSZXN1bHRzID0gbmV3IFNlbGVjdFJlc3VsdHMoe30pIC8vIHdpbGwgYmUgcmV0dXJuZWRcblxuICBjb25zdCByZXNwb25zZVN0cmVhbSA9IHJlYWRhYmxlU3RyZWFtKHJlcykgLy8gY29udmVydCBieXRlIGFycmF5IHRvIGEgcmVhZGFibGUgcmVzcG9uc2VTdHJlYW1cbiAgLy8gQHRzLWlnbm9yZVxuICB3aGlsZSAocmVzcG9uc2VTdHJlYW0uX3JlYWRhYmxlU3RhdGUubGVuZ3RoKSB7XG4gICAgLy8gVG9wIGxldmVsIHJlc3BvbnNlU3RyZWFtIHJlYWQgdHJhY2tlci5cbiAgICBsZXQgbXNnQ3JjQWNjdW11bGF0b3IgLy8gYWNjdW11bGF0ZSBmcm9tIHN0YXJ0IG9mIHRoZSBtZXNzYWdlIHRpbGwgdGhlIG1lc3NhZ2UgY3JjIHN0YXJ0LlxuXG4gICAgY29uc3QgdG90YWxCeXRlTGVuZ3RoQnVmZmVyID0gQnVmZmVyLmZyb20ocmVzcG9uc2VTdHJlYW0ucmVhZCg0KSlcbiAgICBtc2dDcmNBY2N1bXVsYXRvciA9IGNyYzMyKHRvdGFsQnl0ZUxlbmd0aEJ1ZmZlcilcblxuICAgIGNvbnN0IGhlYWRlckJ5dGVzQnVmZmVyID0gQnVmZmVyLmZyb20ocmVzcG9uc2VTdHJlYW0ucmVhZCg0KSlcbiAgICBtc2dDcmNBY2N1bXVsYXRvciA9IGNyYzMyKGhlYWRlckJ5dGVzQnVmZmVyLCBtc2dDcmNBY2N1bXVsYXRvcilcblxuICAgIGNvbnN0IGNhbGN1bGF0ZWRQcmVsdWRlQ3JjID0gbXNnQ3JjQWNjdW11bGF0b3IucmVhZEludDMyQkUoKSAvLyB1c2UgaXQgdG8gY2hlY2sgaWYgYW55IENSQyBtaXNtYXRjaCBpbiBoZWFkZXIgaXRzZWxmLlxuXG4gICAgY29uc3QgcHJlbHVkZUNyY0J1ZmZlciA9IEJ1ZmZlci5mcm9tKHJlc3BvbnNlU3RyZWFtLnJlYWQoNCkpIC8vIHJlYWQgNCBieXRlcyAgICBpLmUgNCs0ID04ICsgNCA9IDEyICggcHJlbHVkZSArIHByZWx1ZGUgY3JjKVxuICAgIG1zZ0NyY0FjY3VtdWxhdG9yID0gY3JjMzIocHJlbHVkZUNyY0J1ZmZlciwgbXNnQ3JjQWNjdW11bGF0b3IpXG5cbiAgICBjb25zdCB0b3RhbE1zZ0xlbmd0aCA9IHRvdGFsQnl0ZUxlbmd0aEJ1ZmZlci5yZWFkSW50MzJCRSgpXG4gICAgY29uc3QgaGVhZGVyTGVuZ3RoID0gaGVhZGVyQnl0ZXNCdWZmZXIucmVhZEludDMyQkUoKVxuICAgIGNvbnN0IHByZWx1ZGVDcmNCeXRlVmFsdWUgPSBwcmVsdWRlQ3JjQnVmZmVyLnJlYWRJbnQzMkJFKClcblxuICAgIGlmIChwcmVsdWRlQ3JjQnl0ZVZhbHVlICE9PSBjYWxjdWxhdGVkUHJlbHVkZUNyYykge1xuICAgICAgLy8gSGFuZGxlIEhlYWRlciBDUkMgbWlzbWF0Y2ggRXJyb3JcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYEhlYWRlciBDaGVja3N1bSBNaXNtYXRjaCwgUHJlbHVkZSBDUkMgb2YgJHtwcmVsdWRlQ3JjQnl0ZVZhbHVlfSBkb2VzIG5vdCBlcXVhbCBleHBlY3RlZCBDUkMgb2YgJHtjYWxjdWxhdGVkUHJlbHVkZUNyY31gLFxuICAgICAgKVxuICAgIH1cblxuICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge31cbiAgICBpZiAoaGVhZGVyTGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgaGVhZGVyQnl0ZXMgPSBCdWZmZXIuZnJvbShyZXNwb25zZVN0cmVhbS5yZWFkKGhlYWRlckxlbmd0aCkpXG4gICAgICBtc2dDcmNBY2N1bXVsYXRvciA9IGNyYzMyKGhlYWRlckJ5dGVzLCBtc2dDcmNBY2N1bXVsYXRvcilcbiAgICAgIGNvbnN0IGhlYWRlclJlYWRlclN0cmVhbSA9IHJlYWRhYmxlU3RyZWFtKGhlYWRlckJ5dGVzKVxuICAgICAgLy8gQHRzLWlnbm9yZVxuICAgICAgd2hpbGUgKGhlYWRlclJlYWRlclN0cmVhbS5fcmVhZGFibGVTdGF0ZS5sZW5ndGgpIHtcbiAgICAgICAgY29uc3QgaGVhZGVyVHlwZU5hbWUgPSBleHRyYWN0SGVhZGVyVHlwZShoZWFkZXJSZWFkZXJTdHJlYW0pXG4gICAgICAgIGhlYWRlclJlYWRlclN0cmVhbS5yZWFkKDEpIC8vIGp1c3QgcmVhZCBhbmQgaWdub3JlIGl0LlxuICAgICAgICBpZiAoaGVhZGVyVHlwZU5hbWUpIHtcbiAgICAgICAgICBoZWFkZXJzW2hlYWRlclR5cGVOYW1lXSA9IGV4dHJhY3RIZWFkZXJWYWx1ZShoZWFkZXJSZWFkZXJTdHJlYW0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBsZXQgcGF5bG9hZFN0cmVhbVxuICAgIGNvbnN0IHBheUxvYWRMZW5ndGggPSB0b3RhbE1zZ0xlbmd0aCAtIGhlYWRlckxlbmd0aCAtIDE2XG4gICAgaWYgKHBheUxvYWRMZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBwYXlMb2FkQnVmZmVyID0gQnVmZmVyLmZyb20ocmVzcG9uc2VTdHJlYW0ucmVhZChwYXlMb2FkTGVuZ3RoKSlcbiAgICAgIG1zZ0NyY0FjY3VtdWxhdG9yID0gY3JjMzIocGF5TG9hZEJ1ZmZlciwgbXNnQ3JjQWNjdW11bGF0b3IpXG4gICAgICAvLyByZWFkIHRoZSBjaGVja3N1bSBlYXJseSBhbmQgZGV0ZWN0IGFueSBtaXNtYXRjaCBzbyB3ZSBjYW4gYXZvaWQgdW5uZWNlc3NhcnkgZnVydGhlciBwcm9jZXNzaW5nLlxuICAgICAgY29uc3QgbWVzc2FnZUNyY0J5dGVWYWx1ZSA9IEJ1ZmZlci5mcm9tKHJlc3BvbnNlU3RyZWFtLnJlYWQoNCkpLnJlYWRJbnQzMkJFKClcbiAgICAgIGNvbnN0IGNhbGN1bGF0ZWRDcmMgPSBtc2dDcmNBY2N1bXVsYXRvci5yZWFkSW50MzJCRSgpXG4gICAgICAvLyBIYW5kbGUgbWVzc2FnZSBDUkMgRXJyb3JcbiAgICAgIGlmIChtZXNzYWdlQ3JjQnl0ZVZhbHVlICE9PSBjYWxjdWxhdGVkQ3JjKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgTWVzc2FnZSBDaGVja3N1bSBNaXNtYXRjaCwgTWVzc2FnZSBDUkMgb2YgJHttZXNzYWdlQ3JjQnl0ZVZhbHVlfSBkb2VzIG5vdCBlcXVhbCBleHBlY3RlZCBDUkMgb2YgJHtjYWxjdWxhdGVkQ3JjfWAsXG4gICAgICAgIClcbiAgICAgIH1cbiAgICAgIHBheWxvYWRTdHJlYW0gPSByZWFkYWJsZVN0cmVhbShwYXlMb2FkQnVmZmVyKVxuICAgIH1cbiAgICBjb25zdCBtZXNzYWdlVHlwZSA9IGhlYWRlcnNbJ21lc3NhZ2UtdHlwZSddXG5cbiAgICBzd2l0Y2ggKG1lc3NhZ2VUeXBlKSB7XG4gICAgICBjYXNlICdlcnJvcic6IHtcbiAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gaGVhZGVyc1snZXJyb3ItY29kZSddICsgJzpcIicgKyBoZWFkZXJzWydlcnJvci1tZXNzYWdlJ10gKyAnXCInXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihlcnJvck1lc3NhZ2UpXG4gICAgICB9XG4gICAgICBjYXNlICdldmVudCc6IHtcbiAgICAgICAgY29uc3QgY29udGVudFR5cGUgPSBoZWFkZXJzWydjb250ZW50LXR5cGUnXVxuICAgICAgICBjb25zdCBldmVudFR5cGUgPSBoZWFkZXJzWydldmVudC10eXBlJ11cblxuICAgICAgICBzd2l0Y2ggKGV2ZW50VHlwZSkge1xuICAgICAgICAgIGNhc2UgJ0VuZCc6IHtcbiAgICAgICAgICAgIHNlbGVjdFJlc3VsdHMuc2V0UmVzcG9uc2UocmVzKVxuICAgICAgICAgICAgcmV0dXJuIHNlbGVjdFJlc3VsdHNcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjYXNlICdSZWNvcmRzJzoge1xuICAgICAgICAgICAgY29uc3QgcmVhZERhdGEgPSBwYXlsb2FkU3RyZWFtPy5yZWFkKHBheUxvYWRMZW5ndGgpXG4gICAgICAgICAgICBzZWxlY3RSZXN1bHRzLnNldFJlY29yZHMocmVhZERhdGEpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNhc2UgJ1Byb2dyZXNzJzpcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3dpdGNoIChjb250ZW50VHlwZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ3RleHQveG1sJzoge1xuICAgICAgICAgICAgICAgICAgY29uc3QgcHJvZ3Jlc3NEYXRhID0gcGF5bG9hZFN0cmVhbT8ucmVhZChwYXlMb2FkTGVuZ3RoKVxuICAgICAgICAgICAgICAgICAgc2VsZWN0UmVzdWx0cy5zZXRQcm9ncmVzcyhwcm9ncmVzc0RhdGEudG9TdHJpbmcoKSlcbiAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGBVbmV4cGVjdGVkIGNvbnRlbnQtdHlwZSAke2NvbnRlbnRUeXBlfSBzZW50IGZvciBldmVudC10eXBlIFByb2dyZXNzYFxuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGVycm9yTWVzc2FnZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSAnU3RhdHMnOlxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBzd2l0Y2ggKGNvbnRlbnRUeXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAndGV4dC94bWwnOiB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBzdGF0c0RhdGEgPSBwYXlsb2FkU3RyZWFtPy5yZWFkKHBheUxvYWRMZW5ndGgpXG4gICAgICAgICAgICAgICAgICBzZWxlY3RSZXN1bHRzLnNldFN0YXRzKHN0YXRzRGF0YS50b1N0cmluZygpKVxuICAgICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZGVmYXVsdDoge1xuICAgICAgICAgICAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gYFVuZXhwZWN0ZWQgY29udGVudC10eXBlICR7Y29udGVudFR5cGV9IHNlbnQgZm9yIGV2ZW50LXR5cGUgU3RhdHNgXG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZXJyb3JNZXNzYWdlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICAvLyBDb250aW51YXRpb24gbWVzc2FnZTogTm90IHN1cmUgaWYgaXQgaXMgc3VwcG9ydGVkLiBkaWQgbm90IGZpbmQgYSByZWZlcmVuY2Ugb3IgYW55IG1lc3NhZ2UgaW4gcmVzcG9uc2UuXG4gICAgICAgICAgICAvLyBJdCBkb2VzIG5vdCBoYXZlIGEgcGF5bG9hZC5cbiAgICAgICAgICAgIGNvbnN0IHdhcm5pbmdNZXNzYWdlID0gYFVuIGltcGxlbWVudGVkIGV2ZW50IGRldGVjdGVkICAke21lc3NhZ2VUeXBlfS5gXG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgICAgICAgY29uc29sZS53YXJuKHdhcm5pbmdNZXNzYWdlKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VMaWZlY3ljbGVDb25maWcoeG1sOiBzdHJpbmcpIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICByZXR1cm4geG1sT2JqLkxpZmVjeWNsZUNvbmZpZ3VyYXRpb25cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQnVja2V0RW5jcnlwdGlvbkNvbmZpZyh4bWw6IHN0cmluZykge1xuICByZXR1cm4gcGFyc2VYbWwoeG1sKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VPYmplY3RSZXRlbnRpb25Db25maWcoeG1sOiBzdHJpbmcpIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICBjb25zdCByZXRlbnRpb25Db25maWcgPSB4bWxPYmouUmV0ZW50aW9uXG4gIHJldHVybiB7XG4gICAgbW9kZTogcmV0ZW50aW9uQ29uZmlnLk1vZGUsXG4gICAgcmV0YWluVW50aWxEYXRlOiByZXRlbnRpb25Db25maWcuUmV0YWluVW50aWxEYXRlLFxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVPYmplY3RzUGFyc2VyKHhtbDogc3RyaW5nKSB7XG4gIGNvbnN0IHhtbE9iaiA9IHBhcnNlWG1sKHhtbClcbiAgaWYgKHhtbE9iai5EZWxldGVSZXN1bHQgJiYgeG1sT2JqLkRlbGV0ZVJlc3VsdC5FcnJvcikge1xuICAgIC8vIHJldHVybiBlcnJvcnMgYXMgYXJyYXkgYWx3YXlzLiBhcyB0aGUgcmVzcG9uc2UgaXMgb2JqZWN0IGluIGNhc2Ugb2Ygc2luZ2xlIG9iamVjdCBwYXNzZWQgaW4gcmVtb3ZlT2JqZWN0c1xuICAgIHJldHVybiB0b0FycmF5KHhtbE9iai5EZWxldGVSZXN1bHQuRXJyb3IpXG4gIH1cbiAgcmV0dXJuIFtdXG59XG5cbi8vIHBhcnNlIFhNTCByZXNwb25zZSBmb3IgY29weSBvYmplY3RcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUNvcHlPYmplY3QoeG1sOiBzdHJpbmcpOiBDb3B5T2JqZWN0UmVzdWx0VjEge1xuICBjb25zdCByZXN1bHQ6IENvcHlPYmplY3RSZXN1bHRWMSA9IHtcbiAgICBldGFnOiAnJyxcbiAgICBsYXN0TW9kaWZpZWQ6ICcnLFxuICB9XG5cbiAgbGV0IHhtbG9iaiA9IHBhcnNlWG1sKHhtbClcbiAgaWYgKCF4bWxvYmouQ29weU9iamVjdFJlc3VsdCkge1xuICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZFhNTEVycm9yKCdNaXNzaW5nIHRhZzogXCJDb3B5T2JqZWN0UmVzdWx0XCInKVxuICB9XG4gIHhtbG9iaiA9IHhtbG9iai5Db3B5T2JqZWN0UmVzdWx0XG4gIGlmICh4bWxvYmouRVRhZykge1xuICAgIHJlc3VsdC5ldGFnID0geG1sb2JqLkVUYWcucmVwbGFjZSgvXlwiL2csICcnKVxuICAgICAgLnJlcGxhY2UoL1wiJC9nLCAnJylcbiAgICAgIC5yZXBsYWNlKC9eJnF1b3Q7L2csICcnKVxuICAgICAgLnJlcGxhY2UoLyZxdW90OyQvZywgJycpXG4gICAgICAucmVwbGFjZSgvXiYjMzQ7L2csICcnKVxuICAgICAgLnJlcGxhY2UoLyYjMzQ7JC9nLCAnJylcbiAgfVxuICBpZiAoeG1sb2JqLkxhc3RNb2RpZmllZCkge1xuICAgIHJlc3VsdC5sYXN0TW9kaWZpZWQgPSBuZXcgRGF0ZSh4bWxvYmouTGFzdE1vZGlmaWVkKVxuICB9XG5cbiAgcmV0dXJuIHJlc3VsdFxufVxuZXhwb3J0IGZ1bmN0aW9uIHVwbG9hZFBhcnRQYXJzZXIoeG1sOiBzdHJpbmcpIHtcbiAgY29uc3QgeG1sT2JqID0gcGFyc2VYbWwoeG1sKVxuICBjb25zdCByZXNwRWwgPSB4bWxPYmouQ29weVBhcnRS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