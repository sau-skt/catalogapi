"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  Client: true,
  CopyConditions: true,
  PostPolicy: true
};
var Stream = _interopRequireWildcard(require("stream"), true);
var _xml2js = require("xml2js");
var errors = _interopRequireWildcard(require("./errors.js"), true);
Object.keys(errors).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === errors[key]) return;
  exports[key] = errors[key];
});
var _callbackify = require("./internal/callbackify.js");
var _client = require("./internal/client.js");
var _copyConditions = require("./internal/copy-conditions.js");
exports.CopyConditions = _copyConditions.CopyConditions;
var _helper = require("./internal/helper.js");
var _postPolicy = require("./internal/post-policy.js");
exports.PostPolicy = _postPolicy.PostPolicy;
var _notification = require("./notification.js");
Object.keys(_notification).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _notification[key]) return;
  exports[key] = _notification[key];
});
var _promisify = require("./promisify.js");
var transformers = _interopRequireWildcard(require("./transformers.js"), true);
var _helpers = require("./helpers.js");
Object.keys(_helpers).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _helpers[key]) return;
  exports[key] = _helpers[key];
});
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015 MinIO, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

class Client extends _client.TypedClient {
  //
  // __Arguments__
  // * `appName` _string_ - Application name.
  // * `appVersion` _string_ - Application version.

  // list a batch of objects
  listObjectsQuery(bucketName, prefix, marker, listQueryOpts = {}) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isString)(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!(0, _helper.isString)(marker)) {
      throw new TypeError('marker should be of type "string"');
    }
    let {
      Delimiter,
      MaxKeys,
      IncludeVersion
    } = listQueryOpts;
    if (!(0, _helper.isObject)(listQueryOpts)) {
      throw new TypeError('listQueryOpts should be of type "object"');
    }
    if (!(0, _helper.isString)(Delimiter)) {
      throw new TypeError('Delimiter should be of type "string"');
    }
    if (!(0, _helper.isNumber)(MaxKeys)) {
      throw new TypeError('MaxKeys should be of type "number"');
    }
    const queries = [];
    // escape every value in query string, except maxKeys
    queries.push(`prefix=${(0, _helper.uriEscape)(prefix)}`);
    queries.push(`delimiter=${(0, _helper.uriEscape)(Delimiter)}`);
    queries.push(`encoding-type=url`);
    if (IncludeVersion) {
      queries.push(`versions`);
    }
    if (marker) {
      marker = (0, _helper.uriEscape)(marker);
      if (IncludeVersion) {
        queries.push(`key-marker=${marker}`);
      } else {
        queries.push(`marker=${marker}`);
      }
    }

    // no need to escape maxKeys
    if (MaxKeys) {
      if (MaxKeys >= 1000) {
        MaxKeys = 1000;
      }
      queries.push(`max-keys=${MaxKeys}`);
    }
    queries.sort();
    var query = '';
    if (queries.length > 0) {
      query = `${queries.join('&')}`;
    }
    var method = 'GET';
    var transformer = transformers.getListObjectsTransformer();
    this.makeRequest({
      method,
      bucketName,
      query
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return transformer.emit('error', e);
      }
      (0, _helper.pipesetup)(response, transformer);
    });
    return transformer;
  }

  // List the objects in the bucket.
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: the prefix of the objects that should be listed (optional, default `''`)
  // * `recursive` _bool_: `true` indicates recursive style listing and `false` indicates directory style listing delimited by '/'. (optional, default `false`)
  // * `listOpts _object_: query params to list object with below keys
  // *    listOpts.MaxKeys _int_ maximum number of keys to return
  // *    listOpts.IncludeVersion  _bool_ true|false to include versions.
  // __Return Value__
  // * `stream` _Stream_: stream emitting the objects in the bucket, the object is of the format:
  // * `obj.name` _string_: name of the object
  // * `obj.prefix` _string_: name of the object prefix
  // * `obj.size` _number_: size of the object
  // * `obj.etag` _string_: etag of the object
  // * `obj.lastModified` _Date_: modified time stamp
  // * `obj.isDeleteMarker` _boolean_: true if it is a delete marker
  // * `obj.versionId` _string_: versionId of the object
  listObjects(bucketName, prefix, recursive, listOpts = {}) {
    if (prefix === undefined) {
      prefix = '';
    }
    if (recursive === undefined) {
      recursive = false;
    }
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidPrefix)(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix : ${prefix}`);
    }
    if (!(0, _helper.isString)(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!(0, _helper.isBoolean)(recursive)) {
      throw new TypeError('recursive should be of type "boolean"');
    }
    if (!(0, _helper.isObject)(listOpts)) {
      throw new TypeError('listOpts should be of type "object"');
    }
    var marker = '';
    const listQueryOpts = {
      Delimiter: recursive ? '' : '/',
      // if recursive is false set delimiter to '/'
      MaxKeys: 1000,
      IncludeVersion: listOpts.IncludeVersion
    };
    var objects = [];
    var ended = false;
    var readStream = Stream.Readable({
      objectMode: true
    });
    readStream._read = () => {
      // push one object per _read()
      if (objects.length) {
        readStream.push(objects.shift());
        return;
      }
      if (ended) {
        return readStream.push(null);
      }
      // if there are no objects to push do query for the next batch of objects
      this.listObjectsQuery(bucketName, prefix, marker, listQueryOpts).on('error', e => readStream.emit('error', e)).on('data', result => {
        if (result.isTruncated) {
          marker = result.nextMarker || result.versionIdMarker;
        } else {
          ended = true;
        }
        objects = result.objects;
        readStream._read();
      });
    };
    return readStream;
  }

  // listObjectsV2Query - (List Objects V2) - List some or all (up to 1000) of the objects in a bucket.
  //
  // You can use the request parameters as selection criteria to return a subset of the objects in a bucket.
  // request parameters :-
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: Limits the response to keys that begin with the specified prefix.
  // * `continuation-token` _string_: Used to continue iterating over a set of objects.
  // * `delimiter` _string_: A delimiter is a character you use to group keys.
  // * `max-keys` _number_: Sets the maximum number of keys returned in the response body.
  // * `start-after` _string_: Specifies the key to start after when listing objects in a bucket.
  listObjectsV2Query(bucketName, prefix, continuationToken, delimiter, maxKeys, startAfter) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isString)(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!(0, _helper.isString)(continuationToken)) {
      throw new TypeError('continuationToken should be of type "string"');
    }
    if (!(0, _helper.isString)(delimiter)) {
      throw new TypeError('delimiter should be of type "string"');
    }
    if (!(0, _helper.isNumber)(maxKeys)) {
      throw new TypeError('maxKeys should be of type "number"');
    }
    if (!(0, _helper.isString)(startAfter)) {
      throw new TypeError('startAfter should be of type "string"');
    }
    var queries = [];

    // Call for listing objects v2 API
    queries.push(`list-type=2`);
    queries.push(`encoding-type=url`);

    // escape every value in query string, except maxKeys
    queries.push(`prefix=${(0, _helper.uriEscape)(prefix)}`);
    queries.push(`delimiter=${(0, _helper.uriEscape)(delimiter)}`);
    if (continuationToken) {
      continuationToken = (0, _helper.uriEscape)(continuationToken);
      queries.push(`continuation-token=${continuationToken}`);
    }
    // Set start-after
    if (startAfter) {
      startAfter = (0, _helper.uriEscape)(startAfter);
      queries.push(`start-after=${startAfter}`);
    }
    // no need to escape maxKeys
    if (maxKeys) {
      if (maxKeys >= 1000) {
        maxKeys = 1000;
      }
      queries.push(`max-keys=${maxKeys}`);
    }
    queries.sort();
    var query = '';
    if (queries.length > 0) {
      query = `${queries.join('&')}`;
    }
    var method = 'GET';
    var transformer = transformers.getListObjectsV2Transformer();
    this.makeRequest({
      method,
      bucketName,
      query
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return transformer.emit('error', e);
      }
      (0, _helper.pipesetup)(response, transformer);
    });
    return transformer;
  }

  // List the objects in the bucket using S3 ListObjects V2
  //
  // __Arguments__
  // * `bucketName` _string_: name of the bucket
  // * `prefix` _string_: the prefix of the objects that should be listed (optional, default `''`)
  // * `recursive` _bool_: `true` indicates recursive style listing and `false` indicates directory style listing delimited by '/'. (optional, default `false`)
  // * `startAfter` _string_: Specifies the key to start after when listing objects in a bucket. (optional, default `''`)
  //
  // __Return Value__
  // * `stream` _Stream_: stream emitting the objects in the bucket, the object is of the format:
  //   * `obj.name` _string_: name of the object
  //   * `obj.prefix` _string_: name of the object prefix
  //   * `obj.size` _number_: size of the object
  //   * `obj.etag` _string_: etag of the object
  //   * `obj.lastModified` _Date_: modified time stamp
  listObjectsV2(bucketName, prefix, recursive, startAfter) {
    if (prefix === undefined) {
      prefix = '';
    }
    if (recursive === undefined) {
      recursive = false;
    }
    if (startAfter === undefined) {
      startAfter = '';
    }
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isValidPrefix)(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix : ${prefix}`);
    }
    if (!(0, _helper.isString)(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!(0, _helper.isBoolean)(recursive)) {
      throw new TypeError('recursive should be of type "boolean"');
    }
    if (!(0, _helper.isString)(startAfter)) {
      throw new TypeError('startAfter should be of type "string"');
    }
    // if recursive is false set delimiter to '/'
    var delimiter = recursive ? '' : '/';
    var continuationToken = '';
    var objects = [];
    var ended = false;
    var readStream = Stream.Readable({
      objectMode: true
    });
    readStream._read = () => {
      // push one object per _read()
      if (objects.length) {
        readStream.push(objects.shift());
        return;
      }
      if (ended) {
        return readStream.push(null);
      }
      // if there are no objects to push do query for the next batch of objects
      this.listObjectsV2Query(bucketName, prefix, continuationToken, delimiter, 1000, startAfter).on('error', e => readStream.emit('error', e)).on('data', result => {
        if (result.isTruncated) {
          continuationToken = result.nextContinuationToken;
        } else {
          ended = true;
        }
        objects = result.objects;
        readStream._read();
      });
    };
    return readStream;
  }

  // Remove all the notification configurations in the S3 provider
  setBucketNotification(bucketName, config, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isObject)(config)) {
      throw new TypeError('notification config should be of type "Object"');
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var method = 'PUT';
    var query = 'notification';
    var builder = new _xml2js.Builder({
      rootName: 'NotificationConfiguration',
      renderOpts: {
        pretty: false
      },
      headless: true
    });
    var payload = builder.buildObject(config);
    this.makeRequest({
      method,
      bucketName,
      query
    }, payload, [200], '', false, cb);
  }
  removeAllBucketNotification(bucketName, cb) {
    this.setBucketNotification(bucketName, new _notification.NotificationConfig(), cb);
  }

  // Return the list of notification configurations stored
  // in the S3 provider
  getBucketNotification(bucketName, cb) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!(0, _helper.isFunction)(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var method = 'GET';
    var query = 'notification';
    this.makeRequest({
      method,
      bucketName,
      query
    }, '', [200], '', true, (e, response) => {
      if (e) {
        return cb(e);
      }
      var transformer = transformers.getBucketNotificationTransformer();
      var bucketNotification;
      (0, _helper.pipesetup)(response, transformer).on('data', result => bucketNotification = result).on('error', e => cb(e)).on('end', () => cb(null, bucketNotification));
    });
  }

  // Listens for bucket notifications. Returns an EventEmitter.
  listenBucketNotification(bucketName, prefix, suffix, events) {
    if (!(0, _helper.isValidBucketName)(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!(0, _helper.isString)(prefix)) {
      throw new TypeError('prefix must be of type string');
    }
    if (!(0, _helper.isString)(suffix)) {
      throw new TypeError('suffix must be of type string');
    }
    if (!Array.isArray(events)) {
      throw new TypeError('events must be of type Array');
    }
    let listener = new _notification.NotificationPoller(this, bucketName, prefix, suffix, events);
    listener.start();
    return listener;
  }
}
exports.Client = Client;
Client.prototype.getBucketNotification = (0, _promisify.promisify)(Client.prototype.getBucketNotification);
Client.prototype.setBucketNotification = (0, _promisify.promisify)(Client.prototype.setBucketNotification);
Client.prototype.removeAllBucketNotification = (0, _promisify.promisify)(Client.prototype.removeAllBucketNotification);

// refactored API use promise internally
Client.prototype.makeBucket = (0, _callbackify.callbackify)(Client.prototype.makeBucket);
Client.prototype.bucketExists = (0, _callbackify.callbackify)(Client.prototype.bucketExists);
Client.prototype.removeBucket = (0, _callbackify.callbackify)(Client.prototype.removeBucket);
Client.prototype.listBuckets = (0, _callbackify.callbackify)(Client.prototype.listBuckets);
Client.prototype.getObject = (0, _callbackify.callbackify)(Client.prototype.getObject);
Client.prototype.fGetObject = (0, _callbackify.callbackify)(Client.prototype.fGetObject);
Client.prototype.getPartialObject = (0, _callbackify.callbackify)(Client.prototype.getPartialObject);
Client.prototype.statObject = (0, _callbackify.callbackify)(Client.prototype.statObject);
Client.prototype.putObjectRetention = (0, _callbackify.callbackify)(Client.prototype.putObjectRetention);
Client.prototype.putObject = (0, _callbackify.callbackify)(Client.prototype.putObject);
Client.prototype.fPutObject = (0, _callbackify.callbackify)(Client.prototype.fPutObject);
Client.prototype.removeObject = (0, _callbackify.callbackify)(Client.prototype.removeObject);
Client.prototype.removeBucketReplication = (0, _callbackify.callbackify)(Client.prototype.removeBucketReplication);
Client.prototype.setBucketReplication = (0, _callbackify.callbackify)(Client.prototype.setBucketReplication);
Client.prototype.getBucketReplication = (0, _callbackify.callbackify)(Client.prototype.getBucketReplication);
Client.prototype.getObjectLegalHold = (0, _callbackify.callbackify)(Client.prototype.getObjectLegalHold);
Client.prototype.setObjectLegalHold = (0, _callbackify.callbackify)(Client.prototype.setObjectLegalHold);
Client.prototype.setObjectLockConfig = (0, _callbackify.callbackify)(Client.prototype.setObjectLockConfig);
Client.prototype.getObjectLockConfig = (0, _callbackify.callbackify)(Client.prototype.getObjectLockConfig);
Client.prototype.getBucketPolicy = (0, _callbackify.callbackify)(Client.prototype.getBucketPolicy);
Client.prototype.setBucketPolicy = (0, _callbackify.callbackify)(Client.prototype.setBucketPolicy);
Client.prototype.getBucketTagging = (0, _callbackify.callbackify)(Client.prototype.getBucketTagging);
Client.prototype.getObjectTagging = (0, _callbackify.callbackify)(Client.prototype.getObjectTagging);
Client.prototype.setBucketTagging = (0, _callbackify.callbackify)(Client.prototype.setBucketTagging);
Client.prototype.removeBucketTagging = (0, _callbackify.callbackify)(Client.prototype.removeBucketTagging);
Client.prototype.setObjectTagging = (0, _callbackify.callbackify)(Client.prototype.setObjectTagging);
Client.prototype.removeObjectTagging = (0, _callbackify.callbackify)(Client.prototype.removeObjectTagging);
Client.prototype.getBucketVersioning = (0, _callbackify.callbackify)(Client.prototype.getBucketVersioning);
Client.prototype.setBucketVersioning = (0, _callbackify.callbackify)(Client.prototype.setBucketVersioning);
Client.prototype.selectObjectContent = (0, _callbackify.callbackify)(Client.prototype.selectObjectContent);
Client.prototype.setBucketLifecycle = (0, _callbackify.callbackify)(Client.prototype.setBucketLifecycle);
Client.prototype.getBucketLifecycle = (0, _callbackify.callbackify)(Client.prototype.getBucketLifecycle);
Client.prototype.removeBucketLifecycle = (0, _callbackify.callbackify)(Client.prototype.removeBucketLifecycle);
Client.prototype.setBucketEncryption = (0, _callbackify.callbackify)(Client.prototype.setBucketEncryption);
Client.prototype.getBucketEncryption = (0, _callbackify.callbackify)(Client.prototype.getBucketEncryption);
Client.prototype.removeBucketEncryption = (0, _callbackify.callbackify)(Client.prototype.removeBucketEncryption);
Client.prototype.getObjectRetention = (0, _callbackify.callbackify)(Client.prototype.getObjectRetention);
Client.prototype.removeObjects = (0, _callbackify.callbackify)(Client.prototype.removeObjects);
Client.prototype.removeIncompleteUpload = (0, _callbackify.callbackify)(Client.prototype.removeIncompleteUpload);
Client.prototype.copyObject = (0, _callbackify.callbackify)(Client.prototype.copyObject);
Client.prototype.composeObject = (0, _callbackify.callbackify)(Client.prototype.composeObject);
Client.prototype.presignedUrl = (0, _callbackify.callbackify)(Client.prototype.presignedUrl);
Client.prototype.presignedGetObject = (0, _callbackify.callbackify)(Client.prototype.presignedGetObject);
Client.prototype.presignedPutObject = (0, _callbackify.callbackify)(Client.prototype.presignedPutObject);
Client.prototype.presignedPostPolicy = (0, _callbackify.callbackify)(Client.prototype.presignedPostPolicy);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTdHJlYW0iLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsInJlcXVpcmUiLCJfeG1sMmpzIiwiZXJyb3JzIiwiT2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJrZXkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJfZXhwb3J0TmFtZXMiLCJleHBvcnRzIiwiX2NhbGxiYWNraWZ5IiwiX2NsaWVudCIsIl9jb3B5Q29uZGl0aW9ucyIsIkNvcHlDb25kaXRpb25zIiwiX2hlbHBlciIsIl9wb3N0UG9saWN5IiwiUG9zdFBvbGljeSIsIl9ub3RpZmljYXRpb24iLCJfcHJvbWlzaWZ5IiwidHJhbnNmb3JtZXJzIiwiX2hlbHBlcnMiLCJfZ2V0UmVxdWlyZVdpbGRjYXJkQ2FjaGUiLCJub2RlSW50ZXJvcCIsIldlYWtNYXAiLCJjYWNoZUJhYmVsSW50ZXJvcCIsImNhY2hlTm9kZUludGVyb3AiLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImNhY2hlIiwiaGFzIiwiZ2V0IiwibmV3T2JqIiwiaGFzUHJvcGVydHlEZXNjcmlwdG9yIiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJkZXNjIiwic2V0IiwiQ2xpZW50IiwiVHlwZWRDbGllbnQiLCJsaXN0T2JqZWN0c1F1ZXJ5IiwiYnVja2V0TmFtZSIsInByZWZpeCIsIm1hcmtlciIsImxpc3RRdWVyeU9wdHMiLCJpc1ZhbGlkQnVja2V0TmFtZSIsIkludmFsaWRCdWNrZXROYW1lRXJyb3IiLCJpc1N0cmluZyIsIlR5cGVFcnJvciIsIkRlbGltaXRlciIsIk1heEtleXMiLCJJbmNsdWRlVmVyc2lvbiIsImlzT2JqZWN0IiwiaXNOdW1iZXIiLCJxdWVyaWVzIiwicHVzaCIsInVyaUVzY2FwZSIsInNvcnQiLCJxdWVyeSIsImxlbmd0aCIsImpvaW4iLCJtZXRob2QiLCJ0cmFuc2Zvcm1lciIsImdldExpc3RPYmplY3RzVHJhbnNmb3JtZXIiLCJtYWtlUmVxdWVzdCIsImUiLCJyZXNwb25zZSIsImVtaXQiLCJwaXBlc2V0dXAiLCJsaXN0T2JqZWN0cyIsInJlY3Vyc2l2ZSIsImxpc3RPcHRzIiwidW5kZWZpbmVkIiwiaXNWYWxpZFByZWZpeCIsIkludmFsaWRQcmVmaXhFcnJvciIsImlzQm9vbGVhbiIsIm9iamVjdHMiLCJlbmRlZCIsInJlYWRTdHJlYW0iLCJSZWFkYWJsZSIsIm9iamVjdE1vZGUiLCJfcmVhZCIsInNoaWZ0Iiwib24iLCJyZXN1bHQiLCJpc1RydW5jYXRlZCIsIm5leHRNYXJrZXIiLCJ2ZXJzaW9uSWRNYXJrZXIiLCJsaXN0T2JqZWN0c1YyUXVlcnkiLCJjb250aW51YXRpb25Ub2tlbiIsImRlbGltaXRlciIsIm1heEtleXMiLCJzdGFydEFmdGVyIiwiZ2V0TGlzdE9iamVjdHNWMlRyYW5zZm9ybWVyIiwibGlzdE9iamVjdHNWMiIsIm5leHRDb250aW51YXRpb25Ub2tlbiIsInNldEJ1Y2tldE5vdGlmaWNhdGlvbiIsImNvbmZpZyIsImNiIiwiaXNGdW5jdGlvbiIsImJ1aWxkZXIiLCJ4bWwyanMiLCJCdWlsZGVyIiwicm9vdE5hbWUiLCJyZW5kZXJPcHRzIiwicHJldHR5IiwiaGVhZGxlc3MiLCJwYXlsb2FkIiwiYnVpbGRPYmplY3QiLCJyZW1vdmVBbGxCdWNrZXROb3RpZmljYXRpb24iLCJOb3RpZmljYXRpb25Db25maWciLCJnZXRCdWNrZXROb3RpZmljYXRpb24iLCJnZXRCdWNrZXROb3RpZmljYXRpb25UcmFuc2Zvcm1lciIsImJ1Y2tldE5vdGlmaWNhdGlvbiIsImxpc3RlbkJ1Y2tldE5vdGlmaWNhdGlvbiIsInN1ZmZpeCIsImV2ZW50cyIsIkFycmF5IiwiaXNBcnJheSIsImxpc3RlbmVyIiwiTm90aWZpY2F0aW9uUG9sbGVyIiwic3RhcnQiLCJwcm9taXNpZnkiLCJtYWtlQnVja2V0IiwiY2FsbGJhY2tpZnkiLCJidWNrZXRFeGlzdHMiLCJyZW1vdmVCdWNrZXQiLCJsaXN0QnVja2V0cyIsImdldE9iamVjdCIsImZHZXRPYmplY3QiLCJnZXRQYXJ0aWFsT2JqZWN0Iiwic3RhdE9iamVjdCIsInB1dE9iamVjdFJldGVudGlvbiIsInB1dE9iamVjdCIsImZQdXRPYmplY3QiLCJyZW1vdmVPYmplY3QiLCJyZW1vdmVCdWNrZXRSZXBsaWNhdGlvbiIsInNldEJ1Y2tldFJlcGxpY2F0aW9uIiwiZ2V0QnVja2V0UmVwbGljYXRpb24iLCJnZXRPYmplY3RMZWdhbEhvbGQiLCJzZXRPYmplY3RMZWdhbEhvbGQiLCJzZXRPYmplY3RMb2NrQ29uZmlnIiwiZ2V0T2JqZWN0TG9ja0NvbmZpZyIsImdldEJ1Y2tldFBvbGljeSIsInNldEJ1Y2tldFBvbGljeSIsImdldEJ1Y2tldFRhZ2dpbmciLCJnZXRPYmplY3RUYWdnaW5nIiwic2V0QnVja2V0VGFnZ2luZyIsInJlbW92ZUJ1Y2tldFRhZ2dpbmciLCJzZXRPYmplY3RUYWdnaW5nIiwicmVtb3ZlT2JqZWN0VGFnZ2luZyIsImdldEJ1Y2tldFZlcnNpb25pbmciLCJzZXRCdWNrZXRWZXJzaW9uaW5nIiwic2VsZWN0T2JqZWN0Q29udGVudCIsInNldEJ1Y2tldExpZmVjeWNsZSIsImdldEJ1Y2tldExpZmVjeWNsZSIsInJlbW92ZUJ1Y2tldExpZmVjeWNsZSIsInNldEJ1Y2tldEVuY3J5cHRpb24iLCJnZXRCdWNrZXRFbmNyeXB0aW9uIiwicmVtb3ZlQnVja2V0RW5jcnlwdGlvbiIsImdldE9iamVjdFJldGVudGlvbiIsInJlbW92ZU9iamVjdHMiLCJyZW1vdmVJbmNvbXBsZXRlVXBsb2FkIiwiY29weU9iamVjdCIsImNvbXBvc2VPYmplY3QiLCJwcmVzaWduZWRVcmwiLCJwcmVzaWduZWRHZXRPYmplY3QiLCJwcmVzaWduZWRQdXRPYmplY3QiLCJwcmVzaWduZWRQb3N0UG9saWN5Il0sInNvdXJjZXMiOlsibWluaW8uanMiXSwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIE1pbklPIEphdmFzY3JpcHQgTGlicmFyeSBmb3IgQW1hem9uIFMzIENvbXBhdGlibGUgQ2xvdWQgU3RvcmFnZSwgKEMpIDIwMTUgTWluSU8sIEluYy5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cblxuaW1wb3J0ICogYXMgU3RyZWFtIGZyb20gJ25vZGU6c3RyZWFtJ1xuXG5pbXBvcnQgeG1sMmpzIGZyb20gJ3htbDJqcydcblxuaW1wb3J0ICogYXMgZXJyb3JzIGZyb20gJy4vZXJyb3JzLnRzJ1xuaW1wb3J0IHsgY2FsbGJhY2tpZnkgfSBmcm9tICcuL2ludGVybmFsL2NhbGxiYWNraWZ5LmpzJ1xuaW1wb3J0IHsgVHlwZWRDbGllbnQgfSBmcm9tICcuL2ludGVybmFsL2NsaWVudC50cydcbmltcG9ydCB7IENvcHlDb25kaXRpb25zIH0gZnJvbSAnLi9pbnRlcm5hbC9jb3B5LWNvbmRpdGlvbnMudHMnXG5pbXBvcnQge1xuICBpc0Jvb2xlYW4sXG4gIGlzRnVuY3Rpb24sXG4gIGlzTnVtYmVyLFxuICBpc09iamVjdCxcbiAgaXNTdHJpbmcsXG4gIGlzVmFsaWRCdWNrZXROYW1lLFxuICBpc1ZhbGlkUHJlZml4LFxuICBwaXBlc2V0dXAsXG4gIHVyaUVzY2FwZSxcbn0gZnJvbSAnLi9pbnRlcm5hbC9oZWxwZXIudHMnXG5pbXBvcnQgeyBQb3N0UG9saWN5IH0gZnJvbSAnLi9pbnRlcm5hbC9wb3N0LXBvbGljeS50cydcbmltcG9ydCB7IE5vdGlmaWNhdGlvbkNvbmZpZywgTm90aWZpY2F0aW9uUG9sbGVyIH0gZnJvbSAnLi9ub3RpZmljYXRpb24udHMnXG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICcuL3Byb21pc2lmeS5qcydcbmltcG9ydCAqIGFzIHRyYW5zZm9ybWVycyBmcm9tICcuL3RyYW5zZm9ybWVycy5qcydcblxuZXhwb3J0ICogZnJvbSAnLi9lcnJvcnMudHMnXG5leHBvcnQgKiBmcm9tICcuL2hlbHBlcnMudHMnXG5leHBvcnQgKiBmcm9tICcuL25vdGlmaWNhdGlvbi50cydcbmV4cG9ydCB7IENvcHlDb25kaXRpb25zLCBQb3N0UG9saWN5IH1cblxuZXhwb3J0IGNsYXNzIENsaWVudCBleHRlbmRzIFR5cGVkQ2xpZW50IHtcbiAgLy9cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBhcHBOYW1lYCBfc3RyaW5nXyAtIEFwcGxpY2F0aW9uIG5hbWUuXG4gIC8vICogYGFwcFZlcnNpb25gIF9zdHJpbmdfIC0gQXBwbGljYXRpb24gdmVyc2lvbi5cblxuICAvLyBsaXN0IGEgYmF0Y2ggb2Ygb2JqZWN0c1xuICBsaXN0T2JqZWN0c1F1ZXJ5KGJ1Y2tldE5hbWUsIHByZWZpeCwgbWFya2VyLCBsaXN0UXVlcnlPcHRzID0ge30pIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHByZWZpeCkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ByZWZpeCBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhtYXJrZXIpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdtYXJrZXIgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGxldCB7IERlbGltaXRlciwgTWF4S2V5cywgSW5jbHVkZVZlcnNpb24gfSA9IGxpc3RRdWVyeU9wdHNcblxuICAgIGlmICghaXNPYmplY3QobGlzdFF1ZXJ5T3B0cykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2xpc3RRdWVyeU9wdHMgc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgfVxuXG4gICAgaWYgKCFpc1N0cmluZyhEZWxpbWl0ZXIpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdEZWxpbWl0ZXIgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNOdW1iZXIoTWF4S2V5cykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ01heEtleXMgc2hvdWxkIGJlIG9mIHR5cGUgXCJudW1iZXJcIicpXG4gICAgfVxuXG4gICAgY29uc3QgcXVlcmllcyA9IFtdXG4gICAgLy8gZXNjYXBlIGV2ZXJ5IHZhbHVlIGluIHF1ZXJ5IHN0cmluZywgZXhjZXB0IG1heEtleXNcbiAgICBxdWVyaWVzLnB1c2goYHByZWZpeD0ke3VyaUVzY2FwZShwcmVmaXgpfWApXG4gICAgcXVlcmllcy5wdXNoKGBkZWxpbWl0ZXI9JHt1cmlFc2NhcGUoRGVsaW1pdGVyKX1gKVxuICAgIHF1ZXJpZXMucHVzaChgZW5jb2RpbmctdHlwZT11cmxgKVxuXG4gICAgaWYgKEluY2x1ZGVWZXJzaW9uKSB7XG4gICAgICBxdWVyaWVzLnB1c2goYHZlcnNpb25zYClcbiAgICB9XG5cbiAgICBpZiAobWFya2VyKSB7XG4gICAgICBtYXJrZXIgPSB1cmlFc2NhcGUobWFya2VyKVxuICAgICAgaWYgKEluY2x1ZGVWZXJzaW9uKSB7XG4gICAgICAgIHF1ZXJpZXMucHVzaChga2V5LW1hcmtlcj0ke21hcmtlcn1gKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcmllcy5wdXNoKGBtYXJrZXI9JHttYXJrZXJ9YClcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBubyBuZWVkIHRvIGVzY2FwZSBtYXhLZXlzXG4gICAgaWYgKE1heEtleXMpIHtcbiAgICAgIGlmIChNYXhLZXlzID49IDEwMDApIHtcbiAgICAgICAgTWF4S2V5cyA9IDEwMDBcbiAgICAgIH1cbiAgICAgIHF1ZXJpZXMucHVzaChgbWF4LWtleXM9JHtNYXhLZXlzfWApXG4gICAgfVxuICAgIHF1ZXJpZXMuc29ydCgpXG4gICAgdmFyIHF1ZXJ5ID0gJydcbiAgICBpZiAocXVlcmllcy5sZW5ndGggPiAwKSB7XG4gICAgICBxdWVyeSA9IGAke3F1ZXJpZXMuam9pbignJicpfWBcbiAgICB9XG5cbiAgICB2YXIgbWV0aG9kID0gJ0dFVCdcbiAgICB2YXIgdHJhbnNmb3JtZXIgPSB0cmFuc2Zvcm1lcnMuZ2V0TGlzdE9iamVjdHNUcmFuc2Zvcm1lcigpXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnkgfSwgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICByZXR1cm4gdHJhbnNmb3JtZXIuZW1pdCgnZXJyb3InLCBlKVxuICAgICAgfVxuICAgICAgcGlwZXNldHVwKHJlc3BvbnNlLCB0cmFuc2Zvcm1lcilcbiAgICB9KVxuICAgIHJldHVybiB0cmFuc2Zvcm1lclxuICB9XG5cbiAgLy8gTGlzdCB0aGUgb2JqZWN0cyBpbiB0aGUgYnVja2V0LlxuICAvL1xuICAvLyBfX0FyZ3VtZW50c19fXG4gIC8vICogYGJ1Y2tldE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBidWNrZXRcbiAgLy8gKiBgcHJlZml4YCBfc3RyaW5nXzogdGhlIHByZWZpeCBvZiB0aGUgb2JqZWN0cyB0aGF0IHNob3VsZCBiZSBsaXN0ZWQgKG9wdGlvbmFsLCBkZWZhdWx0IGAnJ2ApXG4gIC8vICogYHJlY3Vyc2l2ZWAgX2Jvb2xfOiBgdHJ1ZWAgaW5kaWNhdGVzIHJlY3Vyc2l2ZSBzdHlsZSBsaXN0aW5nIGFuZCBgZmFsc2VgIGluZGljYXRlcyBkaXJlY3Rvcnkgc3R5bGUgbGlzdGluZyBkZWxpbWl0ZWQgYnkgJy8nLiAob3B0aW9uYWwsIGRlZmF1bHQgYGZhbHNlYClcbiAgLy8gKiBgbGlzdE9wdHMgX29iamVjdF86IHF1ZXJ5IHBhcmFtcyB0byBsaXN0IG9iamVjdCB3aXRoIGJlbG93IGtleXNcbiAgLy8gKiAgICBsaXN0T3B0cy5NYXhLZXlzIF9pbnRfIG1heGltdW0gbnVtYmVyIG9mIGtleXMgdG8gcmV0dXJuXG4gIC8vICogICAgbGlzdE9wdHMuSW5jbHVkZVZlcnNpb24gIF9ib29sXyB0cnVlfGZhbHNlIHRvIGluY2x1ZGUgdmVyc2lvbnMuXG4gIC8vIF9fUmV0dXJuIFZhbHVlX19cbiAgLy8gKiBgc3RyZWFtYCBfU3RyZWFtXzogc3RyZWFtIGVtaXR0aW5nIHRoZSBvYmplY3RzIGluIHRoZSBidWNrZXQsIHRoZSBvYmplY3QgaXMgb2YgdGhlIGZvcm1hdDpcbiAgLy8gKiBgb2JqLm5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3RcbiAgLy8gKiBgb2JqLnByZWZpeGAgX3N0cmluZ186IG5hbWUgb2YgdGhlIG9iamVjdCBwcmVmaXhcbiAgLy8gKiBgb2JqLnNpemVgIF9udW1iZXJfOiBzaXplIG9mIHRoZSBvYmplY3RcbiAgLy8gKiBgb2JqLmV0YWdgIF9zdHJpbmdfOiBldGFnIG9mIHRoZSBvYmplY3RcbiAgLy8gKiBgb2JqLmxhc3RNb2RpZmllZGAgX0RhdGVfOiBtb2RpZmllZCB0aW1lIHN0YW1wXG4gIC8vICogYG9iai5pc0RlbGV0ZU1hcmtlcmAgX2Jvb2xlYW5fOiB0cnVlIGlmIGl0IGlzIGEgZGVsZXRlIG1hcmtlclxuICAvLyAqIGBvYmoudmVyc2lvbklkYCBfc3RyaW5nXzogdmVyc2lvbklkIG9mIHRoZSBvYmplY3RcbiAgbGlzdE9iamVjdHMoYnVja2V0TmFtZSwgcHJlZml4LCByZWN1cnNpdmUsIGxpc3RPcHRzID0ge30pIHtcbiAgICBpZiAocHJlZml4ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHByZWZpeCA9ICcnXG4gICAgfVxuICAgIGlmIChyZWN1cnNpdmUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmVjdXJzaXZlID0gZmFsc2VcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkUHJlZml4KHByZWZpeCkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZFByZWZpeEVycm9yKGBJbnZhbGlkIHByZWZpeCA6ICR7cHJlZml4fWApXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcocHJlZml4KSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncHJlZml4IHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBpZiAoIWlzQm9vbGVhbihyZWN1cnNpdmUpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZWN1cnNpdmUgc2hvdWxkIGJlIG9mIHR5cGUgXCJib29sZWFuXCInKVxuICAgIH1cbiAgICBpZiAoIWlzT2JqZWN0KGxpc3RPcHRzKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbGlzdE9wdHMgc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgfVxuICAgIHZhciBtYXJrZXIgPSAnJ1xuICAgIGNvbnN0IGxpc3RRdWVyeU9wdHMgPSB7XG4gICAgICBEZWxpbWl0ZXI6IHJlY3Vyc2l2ZSA/ICcnIDogJy8nLCAvLyBpZiByZWN1cnNpdmUgaXMgZmFsc2Ugc2V0IGRlbGltaXRlciB0byAnLydcbiAgICAgIE1heEtleXM6IDEwMDAsXG4gICAgICBJbmNsdWRlVmVyc2lvbjogbGlzdE9wdHMuSW5jbHVkZVZlcnNpb24sXG4gICAgfVxuICAgIHZhciBvYmplY3RzID0gW11cbiAgICB2YXIgZW5kZWQgPSBmYWxzZVxuICAgIHZhciByZWFkU3RyZWFtID0gU3RyZWFtLlJlYWRhYmxlKHsgb2JqZWN0TW9kZTogdHJ1ZSB9KVxuICAgIHJlYWRTdHJlYW0uX3JlYWQgPSAoKSA9PiB7XG4gICAgICAvLyBwdXNoIG9uZSBvYmplY3QgcGVyIF9yZWFkKClcbiAgICAgIGlmIChvYmplY3RzLmxlbmd0aCkge1xuICAgICAgICByZWFkU3RyZWFtLnB1c2gob2JqZWN0cy5zaGlmdCgpKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGlmIChlbmRlZCkge1xuICAgICAgICByZXR1cm4gcmVhZFN0cmVhbS5wdXNoKG51bGwpXG4gICAgICB9XG4gICAgICAvLyBpZiB0aGVyZSBhcmUgbm8gb2JqZWN0cyB0byBwdXNoIGRvIHF1ZXJ5IGZvciB0aGUgbmV4dCBiYXRjaCBvZiBvYmplY3RzXG4gICAgICB0aGlzLmxpc3RPYmplY3RzUXVlcnkoYnVja2V0TmFtZSwgcHJlZml4LCBtYXJrZXIsIGxpc3RRdWVyeU9wdHMpXG4gICAgICAgIC5vbignZXJyb3InLCAoZSkgPT4gcmVhZFN0cmVhbS5lbWl0KCdlcnJvcicsIGUpKVxuICAgICAgICAub24oJ2RhdGEnLCAocmVzdWx0KSA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdC5pc1RydW5jYXRlZCkge1xuICAgICAgICAgICAgbWFya2VyID0gcmVzdWx0Lm5leHRNYXJrZXIgfHwgcmVzdWx0LnZlcnNpb25JZE1hcmtlclxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbmRlZCA9IHRydWVcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0cyA9IHJlc3VsdC5vYmplY3RzXG4gICAgICAgICAgcmVhZFN0cmVhbS5fcmVhZCgpXG4gICAgICAgIH0pXG4gICAgfVxuICAgIHJldHVybiByZWFkU3RyZWFtXG4gIH1cblxuICAvLyBsaXN0T2JqZWN0c1YyUXVlcnkgLSAoTGlzdCBPYmplY3RzIFYyKSAtIExpc3Qgc29tZSBvciBhbGwgKHVwIHRvIDEwMDApIG9mIHRoZSBvYmplY3RzIGluIGEgYnVja2V0LlxuICAvL1xuICAvLyBZb3UgY2FuIHVzZSB0aGUgcmVxdWVzdCBwYXJhbWV0ZXJzIGFzIHNlbGVjdGlvbiBjcml0ZXJpYSB0byByZXR1cm4gYSBzdWJzZXQgb2YgdGhlIG9iamVjdHMgaW4gYSBidWNrZXQuXG4gIC8vIHJlcXVlc3QgcGFyYW1ldGVycyA6LVxuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYHByZWZpeGAgX3N0cmluZ186IExpbWl0cyB0aGUgcmVzcG9uc2UgdG8ga2V5cyB0aGF0IGJlZ2luIHdpdGggdGhlIHNwZWNpZmllZCBwcmVmaXguXG4gIC8vICogYGNvbnRpbnVhdGlvbi10b2tlbmAgX3N0cmluZ186IFVzZWQgdG8gY29udGludWUgaXRlcmF0aW5nIG92ZXIgYSBzZXQgb2Ygb2JqZWN0cy5cbiAgLy8gKiBgZGVsaW1pdGVyYCBfc3RyaW5nXzogQSBkZWxpbWl0ZXIgaXMgYSBjaGFyYWN0ZXIgeW91IHVzZSB0byBncm91cCBrZXlzLlxuICAvLyAqIGBtYXgta2V5c2AgX251bWJlcl86IFNldHMgdGhlIG1heGltdW0gbnVtYmVyIG9mIGtleXMgcmV0dXJuZWQgaW4gdGhlIHJlc3BvbnNlIGJvZHkuXG4gIC8vICogYHN0YXJ0LWFmdGVyYCBfc3RyaW5nXzogU3BlY2lmaWVzIHRoZSBrZXkgdG8gc3RhcnQgYWZ0ZXIgd2hlbiBsaXN0aW5nIG9iamVjdHMgaW4gYSBidWNrZXQuXG4gIGxpc3RPYmplY3RzVjJRdWVyeShidWNrZXROYW1lLCBwcmVmaXgsIGNvbnRpbnVhdGlvblRva2VuLCBkZWxpbWl0ZXIsIG1heEtleXMsIHN0YXJ0QWZ0ZXIpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHByZWZpeCkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ByZWZpeCBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhjb250aW51YXRpb25Ub2tlbikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NvbnRpbnVhdGlvblRva2VuIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKGRlbGltaXRlcikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2RlbGltaXRlciBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc051bWJlcihtYXhLZXlzKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbWF4S2V5cyBzaG91bGQgYmUgb2YgdHlwZSBcIm51bWJlclwiJylcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhzdGFydEFmdGVyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc3RhcnRBZnRlciBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgdmFyIHF1ZXJpZXMgPSBbXVxuXG4gICAgLy8gQ2FsbCBmb3IgbGlzdGluZyBvYmplY3RzIHYyIEFQSVxuICAgIHF1ZXJpZXMucHVzaChgbGlzdC10eXBlPTJgKVxuICAgIHF1ZXJpZXMucHVzaChgZW5jb2RpbmctdHlwZT11cmxgKVxuXG4gICAgLy8gZXNjYXBlIGV2ZXJ5IHZhbHVlIGluIHF1ZXJ5IHN0cmluZywgZXhjZXB0IG1heEtleXNcbiAgICBxdWVyaWVzLnB1c2goYHByZWZpeD0ke3VyaUVzY2FwZShwcmVmaXgpfWApXG4gICAgcXVlcmllcy5wdXNoKGBkZWxpbWl0ZXI9JHt1cmlFc2NhcGUoZGVsaW1pdGVyKX1gKVxuXG4gICAgaWYgKGNvbnRpbnVhdGlvblRva2VuKSB7XG4gICAgICBjb250aW51YXRpb25Ub2tlbiA9IHVyaUVzY2FwZShjb250aW51YXRpb25Ub2tlbilcbiAgICAgIHF1ZXJpZXMucHVzaChgY29udGludWF0aW9uLXRva2VuPSR7Y29udGludWF0aW9uVG9rZW59YClcbiAgICB9XG4gICAgLy8gU2V0IHN0YXJ0LWFmdGVyXG4gICAgaWYgKHN0YXJ0QWZ0ZXIpIHtcbiAgICAgIHN0YXJ0QWZ0ZXIgPSB1cmlFc2NhcGUoc3RhcnRBZnRlcilcbiAgICAgIHF1ZXJpZXMucHVzaChgc3RhcnQtYWZ0ZXI9JHtzdGFydEFmdGVyfWApXG4gICAgfVxuICAgIC8vIG5vIG5lZWQgdG8gZXNjYXBlIG1heEtleXNcbiAgICBpZiAobWF4S2V5cykge1xuICAgICAgaWYgKG1heEtleXMgPj0gMTAwMCkge1xuICAgICAgICBtYXhLZXlzID0gMTAwMFxuICAgICAgfVxuICAgICAgcXVlcmllcy5wdXNoKGBtYXgta2V5cz0ke21heEtleXN9YClcbiAgICB9XG4gICAgcXVlcmllcy5zb3J0KClcbiAgICB2YXIgcXVlcnkgPSAnJ1xuICAgIGlmIChxdWVyaWVzLmxlbmd0aCA+IDApIHtcbiAgICAgIHF1ZXJ5ID0gYCR7cXVlcmllcy5qb2luKCcmJyl9YFxuICAgIH1cbiAgICB2YXIgbWV0aG9kID0gJ0dFVCdcbiAgICB2YXIgdHJhbnNmb3JtZXIgPSB0cmFuc2Zvcm1lcnMuZ2V0TGlzdE9iamVjdHNWMlRyYW5zZm9ybWVyKClcbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9LCAnJywgWzIwMF0sICcnLCB0cnVlLCAoZSwgcmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiB0cmFuc2Zvcm1lci5lbWl0KCdlcnJvcicsIGUpXG4gICAgICB9XG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgIH0pXG4gICAgcmV0dXJuIHRyYW5zZm9ybWVyXG4gIH1cblxuICAvLyBMaXN0IHRoZSBvYmplY3RzIGluIHRoZSBidWNrZXQgdXNpbmcgUzMgTGlzdE9iamVjdHMgVjJcbiAgLy9cbiAgLy8gX19Bcmd1bWVudHNfX1xuICAvLyAqIGBidWNrZXROYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgYnVja2V0XG4gIC8vICogYHByZWZpeGAgX3N0cmluZ186IHRoZSBwcmVmaXggb2YgdGhlIG9iamVjdHMgdGhhdCBzaG91bGQgYmUgbGlzdGVkIChvcHRpb25hbCwgZGVmYXVsdCBgJydgKVxuICAvLyAqIGByZWN1cnNpdmVgIF9ib29sXzogYHRydWVgIGluZGljYXRlcyByZWN1cnNpdmUgc3R5bGUgbGlzdGluZyBhbmQgYGZhbHNlYCBpbmRpY2F0ZXMgZGlyZWN0b3J5IHN0eWxlIGxpc3RpbmcgZGVsaW1pdGVkIGJ5ICcvJy4gKG9wdGlvbmFsLCBkZWZhdWx0IGBmYWxzZWApXG4gIC8vICogYHN0YXJ0QWZ0ZXJgIF9zdHJpbmdfOiBTcGVjaWZpZXMgdGhlIGtleSB0byBzdGFydCBhZnRlciB3aGVuIGxpc3Rpbmcgb2JqZWN0cyBpbiBhIGJ1Y2tldC4gKG9wdGlvbmFsLCBkZWZhdWx0IGAnJ2ApXG4gIC8vXG4gIC8vIF9fUmV0dXJuIFZhbHVlX19cbiAgLy8gKiBgc3RyZWFtYCBfU3RyZWFtXzogc3RyZWFtIGVtaXR0aW5nIHRoZSBvYmplY3RzIGluIHRoZSBidWNrZXQsIHRoZSBvYmplY3QgaXMgb2YgdGhlIGZvcm1hdDpcbiAgLy8gICAqIGBvYmoubmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIG9iamVjdFxuICAvLyAgICogYG9iai5wcmVmaXhgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBvYmplY3QgcHJlZml4XG4gIC8vICAgKiBgb2JqLnNpemVgIF9udW1iZXJfOiBzaXplIG9mIHRoZSBvYmplY3RcbiAgLy8gICAqIGBvYmouZXRhZ2AgX3N0cmluZ186IGV0YWcgb2YgdGhlIG9iamVjdFxuICAvLyAgICogYG9iai5sYXN0TW9kaWZpZWRgIF9EYXRlXzogbW9kaWZpZWQgdGltZSBzdGFtcFxuICBsaXN0T2JqZWN0c1YyKGJ1Y2tldE5hbWUsIHByZWZpeCwgcmVjdXJzaXZlLCBzdGFydEFmdGVyKSB7XG4gICAgaWYgKHByZWZpeCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwcmVmaXggPSAnJ1xuICAgIH1cbiAgICBpZiAocmVjdXJzaXZlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJlY3Vyc2l2ZSA9IGZhbHNlXG4gICAgfVxuICAgIGlmIChzdGFydEFmdGVyID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHN0YXJ0QWZ0ZXIgPSAnJ1xuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRQcmVmaXgocHJlZml4KSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkUHJlZml4RXJyb3IoYEludmFsaWQgcHJlZml4IDogJHtwcmVmaXh9YClcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhwcmVmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwcmVmaXggc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNCb29sZWFuKHJlY3Vyc2l2ZSkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3JlY3Vyc2l2ZSBzaG91bGQgYmUgb2YgdHlwZSBcImJvb2xlYW5cIicpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcoc3RhcnRBZnRlcikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N0YXJ0QWZ0ZXIgc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIC8vIGlmIHJlY3Vyc2l2ZSBpcyBmYWxzZSBzZXQgZGVsaW1pdGVyIHRvICcvJ1xuICAgIHZhciBkZWxpbWl0ZXIgPSByZWN1cnNpdmUgPyAnJyA6ICcvJ1xuICAgIHZhciBjb250aW51YXRpb25Ub2tlbiA9ICcnXG4gICAgdmFyIG9iamVjdHMgPSBbXVxuICAgIHZhciBlbmRlZCA9IGZhbHNlXG4gICAgdmFyIHJlYWRTdHJlYW0gPSBTdHJlYW0uUmVhZGFibGUoeyBvYmplY3RNb2RlOiB0cnVlIH0pXG4gICAgcmVhZFN0cmVhbS5fcmVhZCA9ICgpID0+IHtcbiAgICAgIC8vIHB1c2ggb25lIG9iamVjdCBwZXIgX3JlYWQoKVxuICAgICAgaWYgKG9iamVjdHMubGVuZ3RoKSB7XG4gICAgICAgIHJlYWRTdHJlYW0ucHVzaChvYmplY3RzLnNoaWZ0KCkpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgaWYgKGVuZGVkKSB7XG4gICAgICAgIHJldHVybiByZWFkU3RyZWFtLnB1c2gobnVsbClcbiAgICAgIH1cbiAgICAgIC8vIGlmIHRoZXJlIGFyZSBubyBvYmplY3RzIHRvIHB1c2ggZG8gcXVlcnkgZm9yIHRoZSBuZXh0IGJhdGNoIG9mIG9iamVjdHNcbiAgICAgIHRoaXMubGlzdE9iamVjdHNWMlF1ZXJ5KGJ1Y2tldE5hbWUsIHByZWZpeCwgY29udGludWF0aW9uVG9rZW4sIGRlbGltaXRlciwgMTAwMCwgc3RhcnRBZnRlcilcbiAgICAgICAgLm9uKCdlcnJvcicsIChlKSA9PiByZWFkU3RyZWFtLmVtaXQoJ2Vycm9yJywgZSkpXG4gICAgICAgIC5vbignZGF0YScsIChyZXN1bHQpID0+IHtcbiAgICAgICAgICBpZiAocmVzdWx0LmlzVHJ1bmNhdGVkKSB7XG4gICAgICAgICAgICBjb250aW51YXRpb25Ub2tlbiA9IHJlc3VsdC5uZXh0Q29udGludWF0aW9uVG9rZW5cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZW5kZWQgPSB0cnVlXG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdHMgPSByZXN1bHQub2JqZWN0c1xuICAgICAgICAgIHJlYWRTdHJlYW0uX3JlYWQoKVxuICAgICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVhZFN0cmVhbVxuICB9XG5cbiAgLy8gUmVtb3ZlIGFsbCB0aGUgbm90aWZpY2F0aW9uIGNvbmZpZ3VyYXRpb25zIGluIHRoZSBTMyBwcm92aWRlclxuICBzZXRCdWNrZXROb3RpZmljYXRpb24oYnVja2V0TmFtZSwgY29uZmlnLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNPYmplY3QoY29uZmlnKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbm90aWZpY2F0aW9uIGNvbmZpZyBzaG91bGQgYmUgb2YgdHlwZSBcIk9iamVjdFwiJylcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG4gICAgdmFyIG1ldGhvZCA9ICdQVVQnXG4gICAgdmFyIHF1ZXJ5ID0gJ25vdGlmaWNhdGlvbidcbiAgICB2YXIgYnVpbGRlciA9IG5ldyB4bWwyanMuQnVpbGRlcih7XG4gICAgICByb290TmFtZTogJ05vdGlmaWNhdGlvbkNvbmZpZ3VyYXRpb24nLFxuICAgICAgcmVuZGVyT3B0czogeyBwcmV0dHk6IGZhbHNlIH0sXG4gICAgICBoZWFkbGVzczogdHJ1ZSxcbiAgICB9KVxuICAgIHZhciBwYXlsb2FkID0gYnVpbGRlci5idWlsZE9iamVjdChjb25maWcpXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnkgfSwgcGF5bG9hZCwgWzIwMF0sICcnLCBmYWxzZSwgY2IpXG4gIH1cblxuICByZW1vdmVBbGxCdWNrZXROb3RpZmljYXRpb24oYnVja2V0TmFtZSwgY2IpIHtcbiAgICB0aGlzLnNldEJ1Y2tldE5vdGlmaWNhdGlvbihidWNrZXROYW1lLCBuZXcgTm90aWZpY2F0aW9uQ29uZmlnKCksIGNiKVxuICB9XG5cbiAgLy8gUmV0dXJuIHRoZSBsaXN0IG9mIG5vdGlmaWNhdGlvbiBjb25maWd1cmF0aW9ucyBzdG9yZWRcbiAgLy8gaW4gdGhlIFMzIHByb3ZpZGVyXG4gIGdldEJ1Y2tldE5vdGlmaWNhdGlvbihidWNrZXROYW1lLCBjYikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNGdW5jdGlvbihjYikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBvZiB0eXBlIFwiZnVuY3Rpb25cIicpXG4gICAgfVxuICAgIHZhciBtZXRob2QgPSAnR0VUJ1xuICAgIHZhciBxdWVyeSA9ICdub3RpZmljYXRpb24nXG4gICAgdGhpcy5tYWtlUmVxdWVzdCh7IG1ldGhvZCwgYnVja2V0TmFtZSwgcXVlcnkgfSwgJycsIFsyMDBdLCAnJywgdHJ1ZSwgKGUsIHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoZSkge1xuICAgICAgICByZXR1cm4gY2IoZSlcbiAgICAgIH1cbiAgICAgIHZhciB0cmFuc2Zvcm1lciA9IHRyYW5zZm9ybWVycy5nZXRCdWNrZXROb3RpZmljYXRpb25UcmFuc2Zvcm1lcigpXG4gICAgICB2YXIgYnVja2V0Tm90aWZpY2F0aW9uXG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgICAgICAub24oJ2RhdGEnLCAocmVzdWx0KSA9PiAoYnVja2V0Tm90aWZpY2F0aW9uID0gcmVzdWx0KSlcbiAgICAgICAgLm9uKCdlcnJvcicsIChlKSA9PiBjYihlKSlcbiAgICAgICAgLm9uKCdlbmQnLCAoKSA9PiBjYihudWxsLCBidWNrZXROb3RpZmljYXRpb24pKVxuICAgIH0pXG4gIH1cblxuICAvLyBMaXN0ZW5zIGZvciBidWNrZXQgbm90aWZpY2F0aW9ucy4gUmV0dXJucyBhbiBFdmVudEVtaXR0ZXIuXG4gIGxpc3RlbkJ1Y2tldE5vdGlmaWNhdGlvbihidWNrZXROYW1lLCBwcmVmaXgsIHN1ZmZpeCwgZXZlbnRzKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKGBJbnZhbGlkIGJ1Y2tldCBuYW1lOiAke2J1Y2tldE5hbWV9YClcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhwcmVmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwcmVmaXggbXVzdCBiZSBvZiB0eXBlIHN0cmluZycpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcoc3VmZml4KSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc3VmZml4IG11c3QgYmUgb2YgdHlwZSBzdHJpbmcnKVxuICAgIH1cbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoZXZlbnRzKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZXZlbnRzIG11c3QgYmUgb2YgdHlwZSBBcnJheScpXG4gICAgfVxuICAgIGxldCBsaXN0ZW5lciA9IG5ldyBOb3RpZmljYXRpb25Qb2xsZXIodGhpcywgYnVja2V0TmFtZSwgcHJlZml4LCBzdWZmaXgsIGV2ZW50cylcbiAgICBsaXN0ZW5lci5zdGFydCgpXG5cbiAgICByZXR1cm4gbGlzdGVuZXJcbiAgfVxufVxuXG5DbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldE5vdGlmaWNhdGlvbiA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldE5vdGlmaWNhdGlvbilcbkNsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0Tm90aWZpY2F0aW9uID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0Tm90aWZpY2F0aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVBbGxCdWNrZXROb3RpZmljYXRpb24gPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVBbGxCdWNrZXROb3RpZmljYXRpb24pXG5cbi8vIHJlZmFjdG9yZWQgQVBJIHVzZSBwcm9taXNlIGludGVybmFsbHlcbkNsaWVudC5wcm90b3R5cGUubWFrZUJ1Y2tldCA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUubWFrZUJ1Y2tldClcbkNsaWVudC5wcm90b3R5cGUuYnVja2V0RXhpc3RzID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5idWNrZXRFeGlzdHMpXG5DbGllbnQucHJvdG90eXBlLnJlbW92ZUJ1Y2tldCA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0KVxuQ2xpZW50LnByb3RvdHlwZS5saXN0QnVja2V0cyA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUubGlzdEJ1Y2tldHMpXG5cbkNsaWVudC5wcm90b3R5cGUuZ2V0T2JqZWN0ID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5nZXRPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLmZHZXRPYmplY3QgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLmZHZXRPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLmdldFBhcnRpYWxPYmplY3QgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLmdldFBhcnRpYWxPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLnN0YXRPYmplY3QgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnN0YXRPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLnB1dE9iamVjdFJldGVudGlvbiA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUucHV0T2JqZWN0UmV0ZW50aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5wdXRPYmplY3QgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnB1dE9iamVjdClcbkNsaWVudC5wcm90b3R5cGUuZlB1dE9iamVjdCA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuZlB1dE9iamVjdClcbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlT2JqZWN0ID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVPYmplY3QpXG5cbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0UmVwbGljYXRpb24gPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZUJ1Y2tldFJlcGxpY2F0aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRSZXBsaWNhdGlvbiA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0UmVwbGljYXRpb24pXG5DbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFJlcGxpY2F0aW9uID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5nZXRCdWNrZXRSZXBsaWNhdGlvbilcbkNsaWVudC5wcm90b3R5cGUuZ2V0T2JqZWN0TGVnYWxIb2xkID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5nZXRPYmplY3RMZWdhbEhvbGQpXG5DbGllbnQucHJvdG90eXBlLnNldE9iamVjdExlZ2FsSG9sZCA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuc2V0T2JqZWN0TGVnYWxIb2xkKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRPYmplY3RMb2NrQ29uZmlnID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5zZXRPYmplY3RMb2NrQ29uZmlnKVxuQ2xpZW50LnByb3RvdHlwZS5nZXRPYmplY3RMb2NrQ29uZmlnID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5nZXRPYmplY3RMb2NrQ29uZmlnKVxuQ2xpZW50LnByb3RvdHlwZS5nZXRCdWNrZXRQb2xpY3kgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFBvbGljeSlcbkNsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0UG9saWN5ID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRQb2xpY3kpXG5DbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFRhZ2dpbmcgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFRhZ2dpbmcpXG5DbGllbnQucHJvdG90eXBlLmdldE9iamVjdFRhZ2dpbmcgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLmdldE9iamVjdFRhZ2dpbmcpXG5DbGllbnQucHJvdG90eXBlLnNldEJ1Y2tldFRhZ2dpbmcgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnNldEJ1Y2tldFRhZ2dpbmcpXG5DbGllbnQucHJvdG90eXBlLnJlbW92ZUJ1Y2tldFRhZ2dpbmcgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZUJ1Y2tldFRhZ2dpbmcpXG5DbGllbnQucHJvdG90eXBlLnNldE9iamVjdFRhZ2dpbmcgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnNldE9iamVjdFRhZ2dpbmcpXG5DbGllbnQucHJvdG90eXBlLnJlbW92ZU9iamVjdFRhZ2dpbmcgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZU9iamVjdFRhZ2dpbmcpXG5DbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFZlcnNpb25pbmcgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFZlcnNpb25pbmcpXG5DbGllbnQucHJvdG90eXBlLnNldEJ1Y2tldFZlcnNpb25pbmcgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnNldEJ1Y2tldFZlcnNpb25pbmcpXG5DbGllbnQucHJvdG90eXBlLnNlbGVjdE9iamVjdENvbnRlbnQgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnNlbGVjdE9iamVjdENvbnRlbnQpXG5DbGllbnQucHJvdG90eXBlLnNldEJ1Y2tldExpZmVjeWNsZSA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0TGlmZWN5Y2xlKVxuQ2xpZW50LnByb3RvdHlwZS5nZXRCdWNrZXRMaWZlY3ljbGUgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldExpZmVjeWNsZSlcbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0TGlmZWN5Y2xlID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVCdWNrZXRMaWZlY3ljbGUpXG5DbGllbnQucHJvdG90eXBlLnNldEJ1Y2tldEVuY3J5cHRpb24gPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnNldEJ1Y2tldEVuY3J5cHRpb24pXG5DbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldEVuY3J5cHRpb24gPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldEVuY3J5cHRpb24pXG5DbGllbnQucHJvdG90eXBlLnJlbW92ZUJ1Y2tldEVuY3J5cHRpb24gPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZUJ1Y2tldEVuY3J5cHRpb24pXG5DbGllbnQucHJvdG90eXBlLmdldE9iamVjdFJldGVudGlvbiA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuZ2V0T2JqZWN0UmV0ZW50aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVPYmplY3RzID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVPYmplY3RzKVxuQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVJbmNvbXBsZXRlVXBsb2FkID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVJbmNvbXBsZXRlVXBsb2FkKVxuQ2xpZW50LnByb3RvdHlwZS5jb3B5T2JqZWN0ID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5jb3B5T2JqZWN0KVxuQ2xpZW50LnByb3RvdHlwZS5jb21wb3NlT2JqZWN0ID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5jb21wb3NlT2JqZWN0KVxuQ2xpZW50LnByb3RvdHlwZS5wcmVzaWduZWRVcmwgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnByZXNpZ25lZFVybClcbkNsaWVudC5wcm90b3R5cGUucHJlc2lnbmVkR2V0T2JqZWN0ID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5wcmVzaWduZWRHZXRPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLnByZXNpZ25lZFB1dE9iamVjdCA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUucHJlc2lnbmVkUHV0T2JqZWN0KVxuQ2xpZW50LnByb3RvdHlwZS5wcmVzaWduZWRQb3N0UG9saWN5ID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5wcmVzaWduZWRQb3N0UG9saWN5KVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBZ0JBLElBQUFBLE1BQUEsR0FBQUMsdUJBQUEsQ0FBQUMsT0FBQTtBQUVBLElBQUFDLE9BQUEsR0FBQUQsT0FBQTtBQUVBLElBQUFFLE1BQUEsR0FBQUgsdUJBQUEsQ0FBQUMsT0FBQTtBQW9CQUcsTUFBQSxDQUFBQyxJQUFBLENBQUFGLE1BQUEsRUFBQUcsT0FBQSxXQUFBQyxHQUFBO0VBQUEsSUFBQUEsR0FBQSxrQkFBQUEsR0FBQTtFQUFBLElBQUFILE1BQUEsQ0FBQUksU0FBQSxDQUFBQyxjQUFB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