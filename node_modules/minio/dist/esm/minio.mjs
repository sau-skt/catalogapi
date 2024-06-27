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

import * as Stream from "stream";
import xml2js from 'xml2js';
import * as errors from "./errors.mjs";
import { callbackify } from "./internal/callbackify.mjs";
import { TypedClient } from "./internal/client.mjs";
import { CopyConditions } from "./internal/copy-conditions.mjs";
import { isBoolean, isFunction, isNumber, isObject, isString, isValidBucketName, isValidPrefix, pipesetup, uriEscape } from "./internal/helper.mjs";
import { PostPolicy } from "./internal/post-policy.mjs";
import { NotificationConfig, NotificationPoller } from "./notification.mjs";
import { promisify } from "./promisify.mjs";
import * as transformers from "./transformers.mjs";
export * from "./errors.mjs";
export * from "./helpers.mjs";
export * from "./notification.mjs";
export { CopyConditions, PostPolicy };
export class Client extends TypedClient {
  //
  // __Arguments__
  // * `appName` _string_ - Application name.
  // * `appVersion` _string_ - Application version.

  // list a batch of objects
  listObjectsQuery(bucketName, prefix, marker, listQueryOpts = {}) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!isString(marker)) {
      throw new TypeError('marker should be of type "string"');
    }
    let {
      Delimiter,
      MaxKeys,
      IncludeVersion
    } = listQueryOpts;
    if (!isObject(listQueryOpts)) {
      throw new TypeError('listQueryOpts should be of type "object"');
    }
    if (!isString(Delimiter)) {
      throw new TypeError('Delimiter should be of type "string"');
    }
    if (!isNumber(MaxKeys)) {
      throw new TypeError('MaxKeys should be of type "number"');
    }
    const queries = [];
    // escape every value in query string, except maxKeys
    queries.push(`prefix=${uriEscape(prefix)}`);
    queries.push(`delimiter=${uriEscape(Delimiter)}`);
    queries.push(`encoding-type=url`);
    if (IncludeVersion) {
      queries.push(`versions`);
    }
    if (marker) {
      marker = uriEscape(marker);
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
      pipesetup(response, transformer);
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidPrefix(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix : ${prefix}`);
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!isBoolean(recursive)) {
      throw new TypeError('recursive should be of type "boolean"');
    }
    if (!isObject(listOpts)) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!isString(continuationToken)) {
      throw new TypeError('continuationToken should be of type "string"');
    }
    if (!isString(delimiter)) {
      throw new TypeError('delimiter should be of type "string"');
    }
    if (!isNumber(maxKeys)) {
      throw new TypeError('maxKeys should be of type "number"');
    }
    if (!isString(startAfter)) {
      throw new TypeError('startAfter should be of type "string"');
    }
    var queries = [];

    // Call for listing objects v2 API
    queries.push(`list-type=2`);
    queries.push(`encoding-type=url`);

    // escape every value in query string, except maxKeys
    queries.push(`prefix=${uriEscape(prefix)}`);
    queries.push(`delimiter=${uriEscape(delimiter)}`);
    if (continuationToken) {
      continuationToken = uriEscape(continuationToken);
      queries.push(`continuation-token=${continuationToken}`);
    }
    // Set start-after
    if (startAfter) {
      startAfter = uriEscape(startAfter);
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
      pipesetup(response, transformer);
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isValidPrefix(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix : ${prefix}`);
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix should be of type "string"');
    }
    if (!isBoolean(recursive)) {
      throw new TypeError('recursive should be of type "boolean"');
    }
    if (!isString(startAfter)) {
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
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isObject(config)) {
      throw new TypeError('notification config should be of type "Object"');
    }
    if (!isFunction(cb)) {
      throw new TypeError('callback should be of type "function"');
    }
    var method = 'PUT';
    var query = 'notification';
    var builder = new xml2js.Builder({
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
    this.setBucketNotification(bucketName, new NotificationConfig(), cb);
  }

  // Return the list of notification configurations stored
  // in the S3 provider
  getBucketNotification(bucketName, cb) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError('Invalid bucket name: ' + bucketName);
    }
    if (!isFunction(cb)) {
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
      pipesetup(response, transformer).on('data', result => bucketNotification = result).on('error', e => cb(e)).on('end', () => cb(null, bucketNotification));
    });
  }

  // Listens for bucket notifications. Returns an EventEmitter.
  listenBucketNotification(bucketName, prefix, suffix, events) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`);
    }
    if (!isString(prefix)) {
      throw new TypeError('prefix must be of type string');
    }
    if (!isString(suffix)) {
      throw new TypeError('suffix must be of type string');
    }
    if (!Array.isArray(events)) {
      throw new TypeError('events must be of type Array');
    }
    let listener = new NotificationPoller(this, bucketName, prefix, suffix, events);
    listener.start();
    return listener;
  }
}
Client.prototype.getBucketNotification = promisify(Client.prototype.getBucketNotification);
Client.prototype.setBucketNotification = promisify(Client.prototype.setBucketNotification);
Client.prototype.removeAllBucketNotification = promisify(Client.prototype.removeAllBucketNotification);

// refactored API use promise internally
Client.prototype.makeBucket = callbackify(Client.prototype.makeBucket);
Client.prototype.bucketExists = callbackify(Client.prototype.bucketExists);
Client.prototype.removeBucket = callbackify(Client.prototype.removeBucket);
Client.prototype.listBuckets = callbackify(Client.prototype.listBuckets);
Client.prototype.getObject = callbackify(Client.prototype.getObject);
Client.prototype.fGetObject = callbackify(Client.prototype.fGetObject);
Client.prototype.getPartialObject = callbackify(Client.prototype.getPartialObject);
Client.prototype.statObject = callbackify(Client.prototype.statObject);
Client.prototype.putObjectRetention = callbackify(Client.prototype.putObjectRetention);
Client.prototype.putObject = callbackify(Client.prototype.putObject);
Client.prototype.fPutObject = callbackify(Client.prototype.fPutObject);
Client.prototype.removeObject = callbackify(Client.prototype.removeObject);
Client.prototype.removeBucketReplication = callbackify(Client.prototype.removeBucketReplication);
Client.prototype.setBucketReplication = callbackify(Client.prototype.setBucketReplication);
Client.prototype.getBucketReplication = callbackify(Client.prototype.getBucketReplication);
Client.prototype.getObjectLegalHold = callbackify(Client.prototype.getObjectLegalHold);
Client.prototype.setObjectLegalHold = callbackify(Client.prototype.setObjectLegalHold);
Client.prototype.setObjectLockConfig = callbackify(Client.prototype.setObjectLockConfig);
Client.prototype.getObjectLockConfig = callbackify(Client.prototype.getObjectLockConfig);
Client.prototype.getBucketPolicy = callbackify(Client.prototype.getBucketPolicy);
Client.prototype.setBucketPolicy = callbackify(Client.prototype.setBucketPolicy);
Client.prototype.getBucketTagging = callbackify(Client.prototype.getBucketTagging);
Client.prototype.getObjectTagging = callbackify(Client.prototype.getObjectTagging);
Client.prototype.setBucketTagging = callbackify(Client.prototype.setBucketTagging);
Client.prototype.removeBucketTagging = callbackify(Client.prototype.removeBucketTagging);
Client.prototype.setObjectTagging = callbackify(Client.prototype.setObjectTagging);
Client.prototype.removeObjectTagging = callbackify(Client.prototype.removeObjectTagging);
Client.prototype.getBucketVersioning = callbackify(Client.prototype.getBucketVersioning);
Client.prototype.setBucketVersioning = callbackify(Client.prototype.setBucketVersioning);
Client.prototype.selectObjectContent = callbackify(Client.prototype.selectObjectContent);
Client.prototype.setBucketLifecycle = callbackify(Client.prototype.setBucketLifecycle);
Client.prototype.getBucketLifecycle = callbackify(Client.prototype.getBucketLifecycle);
Client.prototype.removeBucketLifecycle = callbackify(Client.prototype.removeBucketLifecycle);
Client.prototype.setBucketEncryption = callbackify(Client.prototype.setBucketEncryption);
Client.prototype.getBucketEncryption = callbackify(Client.prototype.getBucketEncryption);
Client.prototype.removeBucketEncryption = callbackify(Client.prototype.removeBucketEncryption);
Client.prototype.getObjectRetention = callbackify(Client.prototype.getObjectRetention);
Client.prototype.removeObjects = callbackify(Client.prototype.removeObjects);
Client.prototype.removeIncompleteUpload = callbackify(Client.prototype.removeIncompleteUpload);
Client.prototype.copyObject = callbackify(Client.prototype.copyObject);
Client.prototype.composeObject = callbackify(Client.prototype.composeObject);
Client.prototype.presignedUrl = callbackify(Client.prototype.presignedUrl);
Client.prototype.presignedGetObject = callbackify(Client.prototype.presignedGetObject);
Client.prototype.presignedPutObject = callbackify(Client.prototype.presignedPutObject);
Client.prototype.presignedPostPolicy = callbackify(Client.prototype.presignedPostPolicy);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTdHJlYW0iLCJ4bWwyanMiLCJlcnJvcnMiLCJjYWxsYmFja2lmeSIsIlR5cGVkQ2xpZW50IiwiQ29weUNvbmRpdGlvbnMiLCJpc0Jvb2xlYW4iLCJpc0Z1bmN0aW9uIiwiaXNOdW1iZXIiLCJpc09iamVjdCIsImlzU3RyaW5nIiwiaXNWYWxpZEJ1Y2tldE5hbWUiLCJpc1ZhbGlkUHJlZml4IiwicGlwZXNldHVwIiwidXJpRXNjYXBlIiwiUG9zdFBvbGljeSIsIk5vdGlmaWNhdGlvbkNvbmZpZyIsIk5vdGlmaWNhdGlvblBvbGxlciIsInByb21pc2lmeSIsInRyYW5zZm9ybWVycyIsIkNsaWVudCIsImxpc3RPYmplY3RzUXVlcnkiLCJidWNrZXROYW1lIiwicHJlZml4IiwibWFya2VyIiwibGlzdFF1ZXJ5T3B0cyIsIkludmFsaWRCdWNrZXROYW1lRXJyb3IiLCJUeXBlRXJyb3IiLCJEZWxpbWl0ZXIiLCJNYXhLZXlzIiwiSW5jbHVkZVZlcnNpb24iLCJxdWVyaWVzIiwicHVzaCIsInNvcnQiLCJxdWVyeSIsImxlbmd0aCIsImpvaW4iLCJtZXRob2QiLCJ0cmFuc2Zvcm1lciIsImdldExpc3RPYmplY3RzVHJhbnNmb3JtZXIiLCJtYWtlUmVxdWVzdCIsImUiLCJyZXNwb25zZSIsImVtaXQiLCJsaXN0T2JqZWN0cyIsInJlY3Vyc2l2ZSIsImxpc3RPcHRzIiwidW5kZWZpbmVkIiwiSW52YWxpZFByZWZpeEVycm9yIiwib2JqZWN0cyIsImVuZGVkIiwicmVhZFN0cmVhbSIsIlJlYWRhYmxlIiwib2JqZWN0TW9kZSIsIl9yZWFkIiwic2hpZnQiLCJvbiIsInJlc3VsdCIsImlzVHJ1bmNhdGVkIiwibmV4dE1hcmtlciIsInZlcnNpb25JZE1hcmtlciIsImxpc3RPYmplY3RzVjJRdWVyeSIsImNvbnRpbnVhdGlvblRva2VuIiwiZGVsaW1pdGVyIiwibWF4S2V5cyIsInN0YXJ0QWZ0ZXIiLCJnZXRMaXN0T2JqZWN0c1YyVHJhbnNmb3JtZXIiLCJsaXN0T2JqZWN0c1YyIiwibmV4dENvbnRpbnVhdGlvblRva2VuIiwic2V0QnVja2V0Tm90aWZpY2F0aW9uIiwiY29uZmlnIiwiY2IiLCJidWlsZGVyIiwiQnVpbGRlciIsInJvb3ROYW1lIiwicmVuZGVyT3B0cyIsInByZXR0eSIsImhlYWRsZXNzIiwicGF5bG9hZCIsImJ1aWxkT2JqZWN0IiwicmVtb3ZlQWxsQnVja2V0Tm90aWZpY2F0aW9uIiwiZ2V0QnVja2V0Tm90aWZpY2F0aW9uIiwiZ2V0QnVja2V0Tm90aWZpY2F0aW9uVHJhbnNmb3JtZXIiLCJidWNrZXROb3RpZmljYXRpb24iLCJsaXN0ZW5CdWNrZXROb3RpZmljYXRpb24iLCJzdWZmaXgiLCJldmVudHMiLCJBcnJheSIsImlzQXJyYXkiLCJsaXN0ZW5lciIsInN0YXJ0IiwicHJvdG90eXBlIiwibWFrZUJ1Y2tldCIsImJ1Y2tldEV4aXN0cyIsInJlbW92ZUJ1Y2tldCIsImxpc3RCdWNrZXRzIiwiZ2V0T2JqZWN0IiwiZkdldE9iamVjdCIsImdldFBhcnRpYWxPYmplY3QiLCJzdGF0T2JqZWN0IiwicHV0T2JqZWN0UmV0ZW50aW9uIiwicHV0T2JqZWN0IiwiZlB1dE9iamVjdCIsInJlbW92ZU9iamVjdCIsInJlbW92ZUJ1Y2tldFJlcGxpY2F0aW9uIiwic2V0QnVja2V0UmVwbGljYXRpb24iLCJnZXRCdWNrZXRSZXBsaWNhdGlvbiIsImdldE9iamVjdExlZ2FsSG9sZCIsInNldE9iamVjdExlZ2FsSG9sZCIsInNldE9iamVjdExvY2tDb25maWciLCJnZXRPYmplY3RMb2NrQ29uZmlnIiwiZ2V0QnVja2V0UG9saWN5Iiwic2V0QnVja2V0UG9saWN5IiwiZ2V0QnVja2V0VGFnZ2luZyIsImdldE9iamVjdFRhZ2dpbmciLCJzZXRCdWNrZXRUYWdnaW5nIiwicmVtb3ZlQnVja2V0VGFnZ2luZyIsInNldE9iamVjdFRhZ2dpbmciLCJyZW1vdmVPYmplY3RUYWdnaW5nIiwiZ2V0QnVja2V0VmVyc2lvbmluZyIsInNldEJ1Y2tldFZlcnNpb25pbmciLCJzZWxlY3RPYmplY3RDb250ZW50Iiwic2V0QnVja2V0TGlmZWN5Y2xlIiwiZ2V0QnVja2V0TGlmZWN5Y2xlIiwicmVtb3ZlQnVja2V0TGlmZWN5Y2xlIiwic2V0QnVja2V0RW5jcnlwdGlvbiIsImdldEJ1Y2tldEVuY3J5cHRpb24iLCJyZW1vdmVCdWNrZXRFbmNyeXB0aW9uIiwiZ2V0T2JqZWN0UmV0ZW50aW9uIiwicmVtb3ZlT2JqZWN0cyIsInJlbW92ZUluY29tcGxldGVVcGxvYWQiLCJjb3B5T2JqZWN0IiwiY29tcG9zZU9iamVjdCIsInByZXNpZ25lZFVybCIsInByZXNpZ25lZEdldE9iamVjdCIsInByZXNpZ25lZFB1dE9iamVjdCIsInByZXNpZ25lZFBvc3RQb2xpY3kiXSwic291cmNlcyI6WyJtaW5pby5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogTWluSU8gSmF2YXNjcmlwdCBMaWJyYXJ5IGZvciBBbWF6b24gUzMgQ29tcGF0aWJsZSBDbG91ZCBTdG9yYWdlLCAoQykgMjAxNSBNaW5JTywgSW5jLlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gKiB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gKiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuXG5pbXBvcnQgKiBhcyBTdHJlYW0gZnJvbSAnbm9kZTpzdHJlYW0nXG5cbmltcG9ydCB4bWwyanMgZnJvbSAneG1sMmpzJ1xuXG5pbXBvcnQgKiBhcyBlcnJvcnMgZnJvbSAnLi9lcnJvcnMudHMnXG5pbXBvcnQgeyBjYWxsYmFja2lmeSB9IGZyb20gJy4vaW50ZXJuYWwvY2FsbGJhY2tpZnkuanMnXG5pbXBvcnQgeyBUeXBlZENsaWVudCB9IGZyb20gJy4vaW50ZXJuYWwvY2xpZW50LnRzJ1xuaW1wb3J0IHsgQ29weUNvbmRpdGlvbnMgfSBmcm9tICcuL2ludGVybmFsL2NvcHktY29uZGl0aW9ucy50cydcbmltcG9ydCB7XG4gIGlzQm9vbGVhbixcbiAgaXNGdW5jdGlvbixcbiAgaXNOdW1iZXIsXG4gIGlzT2JqZWN0LFxuICBpc1N0cmluZyxcbiAgaXNWYWxpZEJ1Y2tldE5hbWUsXG4gIGlzVmFsaWRQcmVmaXgsXG4gIHBpcGVzZXR1cCxcbiAgdXJpRXNjYXBlLFxufSBmcm9tICcuL2ludGVybmFsL2hlbHBlci50cydcbmltcG9ydCB7IFBvc3RQb2xpY3kgfSBmcm9tICcuL2ludGVybmFsL3Bvc3QtcG9saWN5LnRzJ1xuaW1wb3J0IHsgTm90aWZpY2F0aW9uQ29uZmlnLCBOb3RpZmljYXRpb25Qb2xsZXIgfSBmcm9tICcuL25vdGlmaWNhdGlvbi50cydcbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gJy4vcHJvbWlzaWZ5LmpzJ1xuaW1wb3J0ICogYXMgdHJhbnNmb3JtZXJzIGZyb20gJy4vdHJhbnNmb3JtZXJzLmpzJ1xuXG5leHBvcnQgKiBmcm9tICcuL2Vycm9ycy50cydcbmV4cG9ydCAqIGZyb20gJy4vaGVscGVycy50cydcbmV4cG9ydCAqIGZyb20gJy4vbm90aWZpY2F0aW9uLnRzJ1xuZXhwb3J0IHsgQ29weUNvbmRpdGlvbnMsIFBvc3RQb2xpY3kgfVxuXG5leHBvcnQgY2xhc3MgQ2xpZW50IGV4dGVuZHMgVHlwZWRDbGllbnQge1xuICAvL1xuICAvLyBfX0FyZ3VtZW50c19fXG4gIC8vICogYGFwcE5hbWVgIF9zdHJpbmdfIC0gQXBwbGljYXRpb24gbmFtZS5cbiAgLy8gKiBgYXBwVmVyc2lvbmAgX3N0cmluZ18gLSBBcHBsaWNhdGlvbiB2ZXJzaW9uLlxuXG4gIC8vIGxpc3QgYSBiYXRjaCBvZiBvYmplY3RzXG4gIGxpc3RPYmplY3RzUXVlcnkoYnVja2V0TmFtZSwgcHJlZml4LCBtYXJrZXIsIGxpc3RRdWVyeU9wdHMgPSB7fSkge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcocHJlZml4KSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncHJlZml4IHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKG1hcmtlcikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ21hcmtlciBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgbGV0IHsgRGVsaW1pdGVyLCBNYXhLZXlzLCBJbmNsdWRlVmVyc2lvbiB9ID0gbGlzdFF1ZXJ5T3B0c1xuXG4gICAgaWYgKCFpc09iamVjdChsaXN0UXVlcnlPcHRzKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbGlzdFF1ZXJ5T3B0cyBzaG91bGQgYmUgb2YgdHlwZSBcIm9iamVjdFwiJylcbiAgICB9XG5cbiAgICBpZiAoIWlzU3RyaW5nKERlbGltaXRlcikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0RlbGltaXRlciBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc051bWJlcihNYXhLZXlzKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignTWF4S2V5cyBzaG91bGQgYmUgb2YgdHlwZSBcIm51bWJlclwiJylcbiAgICB9XG5cbiAgICBjb25zdCBxdWVyaWVzID0gW11cbiAgICAvLyBlc2NhcGUgZXZlcnkgdmFsdWUgaW4gcXVlcnkgc3RyaW5nLCBleGNlcHQgbWF4S2V5c1xuICAgIHF1ZXJpZXMucHVzaChgcHJlZml4PSR7dXJpRXNjYXBlKHByZWZpeCl9YClcbiAgICBxdWVyaWVzLnB1c2goYGRlbGltaXRlcj0ke3VyaUVzY2FwZShEZWxpbWl0ZXIpfWApXG4gICAgcXVlcmllcy5wdXNoKGBlbmNvZGluZy10eXBlPXVybGApXG5cbiAgICBpZiAoSW5jbHVkZVZlcnNpb24pIHtcbiAgICAgIHF1ZXJpZXMucHVzaChgdmVyc2lvbnNgKVxuICAgIH1cblxuICAgIGlmIChtYXJrZXIpIHtcbiAgICAgIG1hcmtlciA9IHVyaUVzY2FwZShtYXJrZXIpXG4gICAgICBpZiAoSW5jbHVkZVZlcnNpb24pIHtcbiAgICAgICAgcXVlcmllcy5wdXNoKGBrZXktbWFya2VyPSR7bWFya2VyfWApXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyaWVzLnB1c2goYG1hcmtlcj0ke21hcmtlcn1gKVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIG5vIG5lZWQgdG8gZXNjYXBlIG1heEtleXNcbiAgICBpZiAoTWF4S2V5cykge1xuICAgICAgaWYgKE1heEtleXMgPj0gMTAwMCkge1xuICAgICAgICBNYXhLZXlzID0gMTAwMFxuICAgICAgfVxuICAgICAgcXVlcmllcy5wdXNoKGBtYXgta2V5cz0ke01heEtleXN9YClcbiAgICB9XG4gICAgcXVlcmllcy5zb3J0KClcbiAgICB2YXIgcXVlcnkgPSAnJ1xuICAgIGlmIChxdWVyaWVzLmxlbmd0aCA+IDApIHtcbiAgICAgIHF1ZXJ5ID0gYCR7cXVlcmllcy5qb2luKCcmJyl9YFxuICAgIH1cblxuICAgIHZhciBtZXRob2QgPSAnR0VUJ1xuICAgIHZhciB0cmFuc2Zvcm1lciA9IHRyYW5zZm9ybWVycy5nZXRMaXN0T2JqZWN0c1RyYW5zZm9ybWVyKClcbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9LCAnJywgWzIwMF0sICcnLCB0cnVlLCAoZSwgcmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiB0cmFuc2Zvcm1lci5lbWl0KCdlcnJvcicsIGUpXG4gICAgICB9XG4gICAgICBwaXBlc2V0dXAocmVzcG9uc2UsIHRyYW5zZm9ybWVyKVxuICAgIH0pXG4gICAgcmV0dXJuIHRyYW5zZm9ybWVyXG4gIH1cblxuICAvLyBMaXN0IHRoZSBvYmplY3RzIGluIHRoZSBidWNrZXQuXG4gIC8vXG4gIC8vIF9fQXJndW1lbnRzX19cbiAgLy8gKiBgYnVja2V0TmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIGJ1Y2tldFxuICAvLyAqIGBwcmVmaXhgIF9zdHJpbmdfOiB0aGUgcHJlZml4IG9mIHRoZSBvYmplY3RzIHRoYXQgc2hvdWxkIGJlIGxpc3RlZCAob3B0aW9uYWwsIGRlZmF1bHQgYCcnYClcbiAgLy8gKiBgcmVjdXJzaXZlYCBfYm9vbF86IGB0cnVlYCBpbmRpY2F0ZXMgcmVjdXJzaXZlIHN0eWxlIGxpc3RpbmcgYW5kIGBmYWxzZWAgaW5kaWNhdGVzIGRpcmVjdG9yeSBzdHlsZSBsaXN0aW5nIGRlbGltaXRlZCBieSAnLycuIChvcHRpb25hbCwgZGVmYXVsdCBgZmFsc2VgKVxuICAvLyAqIGBsaXN0T3B0cyBfb2JqZWN0XzogcXVlcnkgcGFyYW1zIHRvIGxpc3Qgb2JqZWN0IHdpdGggYmVsb3cga2V5c1xuICAvLyAqICAgIGxpc3RPcHRzLk1heEtleXMgX2ludF8gbWF4aW11bSBudW1iZXIgb2Yga2V5cyB0byByZXR1cm5cbiAgLy8gKiAgICBsaXN0T3B0cy5JbmNsdWRlVmVyc2lvbiAgX2Jvb2xfIHRydWV8ZmFsc2UgdG8gaW5jbHVkZSB2ZXJzaW9ucy5cbiAgLy8gX19SZXR1cm4gVmFsdWVfX1xuICAvLyAqIGBzdHJlYW1gIF9TdHJlYW1fOiBzdHJlYW0gZW1pdHRpbmcgdGhlIG9iamVjdHMgaW4gdGhlIGJ1Y2tldCwgdGhlIG9iamVjdCBpcyBvZiB0aGUgZm9ybWF0OlxuICAvLyAqIGBvYmoubmFtZWAgX3N0cmluZ186IG5hbWUgb2YgdGhlIG9iamVjdFxuICAvLyAqIGBvYmoucHJlZml4YCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0IHByZWZpeFxuICAvLyAqIGBvYmouc2l6ZWAgX251bWJlcl86IHNpemUgb2YgdGhlIG9iamVjdFxuICAvLyAqIGBvYmouZXRhZ2AgX3N0cmluZ186IGV0YWcgb2YgdGhlIG9iamVjdFxuICAvLyAqIGBvYmoubGFzdE1vZGlmaWVkYCBfRGF0ZV86IG1vZGlmaWVkIHRpbWUgc3RhbXBcbiAgLy8gKiBgb2JqLmlzRGVsZXRlTWFya2VyYCBfYm9vbGVhbl86IHRydWUgaWYgaXQgaXMgYSBkZWxldGUgbWFya2VyXG4gIC8vICogYG9iai52ZXJzaW9uSWRgIF9zdHJpbmdfOiB2ZXJzaW9uSWQgb2YgdGhlIG9iamVjdFxuICBsaXN0T2JqZWN0cyhidWNrZXROYW1lLCBwcmVmaXgsIHJlY3Vyc2l2ZSwgbGlzdE9wdHMgPSB7fSkge1xuICAgIGlmIChwcmVmaXggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcHJlZml4ID0gJydcbiAgICB9XG4gICAgaWYgKHJlY3Vyc2l2ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZWN1cnNpdmUgPSBmYWxzZVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoJ0ludmFsaWQgYnVja2V0IG5hbWU6ICcgKyBidWNrZXROYW1lKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRQcmVmaXgocHJlZml4KSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkUHJlZml4RXJyb3IoYEludmFsaWQgcHJlZml4IDogJHtwcmVmaXh9YClcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhwcmVmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwcmVmaXggc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNCb29sZWFuKHJlY3Vyc2l2ZSkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3JlY3Vyc2l2ZSBzaG91bGQgYmUgb2YgdHlwZSBcImJvb2xlYW5cIicpXG4gICAgfVxuICAgIGlmICghaXNPYmplY3QobGlzdE9wdHMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdsaXN0T3B0cyBzaG91bGQgYmUgb2YgdHlwZSBcIm9iamVjdFwiJylcbiAgICB9XG4gICAgdmFyIG1hcmtlciA9ICcnXG4gICAgY29uc3QgbGlzdFF1ZXJ5T3B0cyA9IHtcbiAgICAgIERlbGltaXRlcjogcmVjdXJzaXZlID8gJycgOiAnLycsIC8vIGlmIHJlY3Vyc2l2ZSBpcyBmYWxzZSBzZXQgZGVsaW1pdGVyIHRvICcvJ1xuICAgICAgTWF4S2V5czogMTAwMCxcbiAgICAgIEluY2x1ZGVWZXJzaW9uOiBsaXN0T3B0cy5JbmNsdWRlVmVyc2lvbixcbiAgICB9XG4gICAgdmFyIG9iamVjdHMgPSBbXVxuICAgIHZhciBlbmRlZCA9IGZhbHNlXG4gICAgdmFyIHJlYWRTdHJlYW0gPSBTdHJlYW0uUmVhZGFibGUoeyBvYmplY3RNb2RlOiB0cnVlIH0pXG4gICAgcmVhZFN0cmVhbS5fcmVhZCA9ICgpID0+IHtcbiAgICAgIC8vIHB1c2ggb25lIG9iamVjdCBwZXIgX3JlYWQoKVxuICAgICAgaWYgKG9iamVjdHMubGVuZ3RoKSB7XG4gICAgICAgIHJlYWRTdHJlYW0ucHVzaChvYmplY3RzLnNoaWZ0KCkpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgaWYgKGVuZGVkKSB7XG4gICAgICAgIHJldHVybiByZWFkU3RyZWFtLnB1c2gobnVsbClcbiAgICAgIH1cbiAgICAgIC8vIGlmIHRoZXJlIGFyZSBubyBvYmplY3RzIHRvIHB1c2ggZG8gcXVlcnkgZm9yIHRoZSBuZXh0IGJhdGNoIG9mIG9iamVjdHNcbiAgICAgIHRoaXMubGlzdE9iamVjdHNRdWVyeShidWNrZXROYW1lLCBwcmVmaXgsIG1hcmtlciwgbGlzdFF1ZXJ5T3B0cylcbiAgICAgICAgLm9uKCdlcnJvcicsIChlKSA9PiByZWFkU3RyZWFtLmVtaXQoJ2Vycm9yJywgZSkpXG4gICAgICAgIC5vbignZGF0YScsIChyZXN1bHQpID0+IHtcbiAgICAgICAgICBpZiAocmVzdWx0LmlzVHJ1bmNhdGVkKSB7XG4gICAgICAgICAgICBtYXJrZXIgPSByZXN1bHQubmV4dE1hcmtlciB8fCByZXN1bHQudmVyc2lvbklkTWFya2VyXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVuZGVkID0gdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3RzID0gcmVzdWx0Lm9iamVjdHNcbiAgICAgICAgICByZWFkU3RyZWFtLl9yZWFkKClcbiAgICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIHJlYWRTdHJlYW1cbiAgfVxuXG4gIC8vIGxpc3RPYmplY3RzVjJRdWVyeSAtIChMaXN0IE9iamVjdHMgVjIpIC0gTGlzdCBzb21lIG9yIGFsbCAodXAgdG8gMTAwMCkgb2YgdGhlIG9iamVjdHMgaW4gYSBidWNrZXQuXG4gIC8vXG4gIC8vIFlvdSBjYW4gdXNlIHRoZSByZXF1ZXN0IHBhcmFtZXRlcnMgYXMgc2VsZWN0aW9uIGNyaXRlcmlhIHRvIHJldHVybiBhIHN1YnNldCBvZiB0aGUgb2JqZWN0cyBpbiBhIGJ1Y2tldC5cbiAgLy8gcmVxdWVzdCBwYXJhbWV0ZXJzIDotXG4gIC8vICogYGJ1Y2tldE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBidWNrZXRcbiAgLy8gKiBgcHJlZml4YCBfc3RyaW5nXzogTGltaXRzIHRoZSByZXNwb25zZSB0byBrZXlzIHRoYXQgYmVnaW4gd2l0aCB0aGUgc3BlY2lmaWVkIHByZWZpeC5cbiAgLy8gKiBgY29udGludWF0aW9uLXRva2VuYCBfc3RyaW5nXzogVXNlZCB0byBjb250aW51ZSBpdGVyYXRpbmcgb3ZlciBhIHNldCBvZiBvYmplY3RzLlxuICAvLyAqIGBkZWxpbWl0ZXJgIF9zdHJpbmdfOiBBIGRlbGltaXRlciBpcyBhIGNoYXJhY3RlciB5b3UgdXNlIHRvIGdyb3VwIGtleXMuXG4gIC8vICogYG1heC1rZXlzYCBfbnVtYmVyXzogU2V0cyB0aGUgbWF4aW11bSBudW1iZXIgb2Yga2V5cyByZXR1cm5lZCBpbiB0aGUgcmVzcG9uc2UgYm9keS5cbiAgLy8gKiBgc3RhcnQtYWZ0ZXJgIF9zdHJpbmdfOiBTcGVjaWZpZXMgdGhlIGtleSB0byBzdGFydCBhZnRlciB3aGVuIGxpc3Rpbmcgb2JqZWN0cyBpbiBhIGJ1Y2tldC5cbiAgbGlzdE9iamVjdHNWMlF1ZXJ5KGJ1Y2tldE5hbWUsIHByZWZpeCwgY29udGludWF0aW9uVG9rZW4sIGRlbGltaXRlciwgbWF4S2V5cywgc3RhcnRBZnRlcikge1xuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcocHJlZml4KSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncHJlZml4IHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKGNvbnRpbnVhdGlvblRva2VuKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY29udGludWF0aW9uVG9rZW4gc2hvdWxkIGJlIG9mIHR5cGUgXCJzdHJpbmdcIicpXG4gICAgfVxuICAgIGlmICghaXNTdHJpbmcoZGVsaW1pdGVyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZGVsaW1pdGVyIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICBpZiAoIWlzTnVtYmVyKG1heEtleXMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdtYXhLZXlzIHNob3VsZCBiZSBvZiB0eXBlIFwibnVtYmVyXCInKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHN0YXJ0QWZ0ZXIpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzdGFydEFmdGVyIHNob3VsZCBiZSBvZiB0eXBlIFwic3RyaW5nXCInKVxuICAgIH1cbiAgICB2YXIgcXVlcmllcyA9IFtdXG5cbiAgICAvLyBDYWxsIGZvciBsaXN0aW5nIG9iamVjdHMgdjIgQVBJXG4gICAgcXVlcmllcy5wdXNoKGBsaXN0LXR5cGU9MmApXG4gICAgcXVlcmllcy5wdXNoKGBlbmNvZGluZy10eXBlPXVybGApXG5cbiAgICAvLyBlc2NhcGUgZXZlcnkgdmFsdWUgaW4gcXVlcnkgc3RyaW5nLCBleGNlcHQgbWF4S2V5c1xuICAgIHF1ZXJpZXMucHVzaChgcHJlZml4PSR7dXJpRXNjYXBlKHByZWZpeCl9YClcbiAgICBxdWVyaWVzLnB1c2goYGRlbGltaXRlcj0ke3VyaUVzY2FwZShkZWxpbWl0ZXIpfWApXG5cbiAgICBpZiAoY29udGludWF0aW9uVG9rZW4pIHtcbiAgICAgIGNvbnRpbnVhdGlvblRva2VuID0gdXJpRXNjYXBlKGNvbnRpbnVhdGlvblRva2VuKVxuICAgICAgcXVlcmllcy5wdXNoKGBjb250aW51YXRpb24tdG9rZW49JHtjb250aW51YXRpb25Ub2tlbn1gKVxuICAgIH1cbiAgICAvLyBTZXQgc3RhcnQtYWZ0ZXJcbiAgICBpZiAoc3RhcnRBZnRlcikge1xuICAgICAgc3RhcnRBZnRlciA9IHVyaUVzY2FwZShzdGFydEFmdGVyKVxuICAgICAgcXVlcmllcy5wdXNoKGBzdGFydC1hZnRlcj0ke3N0YXJ0QWZ0ZXJ9YClcbiAgICB9XG4gICAgLy8gbm8gbmVlZCB0byBlc2NhcGUgbWF4S2V5c1xuICAgIGlmIChtYXhLZXlzKSB7XG4gICAgICBpZiAobWF4S2V5cyA+PSAxMDAwKSB7XG4gICAgICAgIG1heEtleXMgPSAxMDAwXG4gICAgICB9XG4gICAgICBxdWVyaWVzLnB1c2goYG1heC1rZXlzPSR7bWF4S2V5c31gKVxuICAgIH1cbiAgICBxdWVyaWVzLnNvcnQoKVxuICAgIHZhciBxdWVyeSA9ICcnXG4gICAgaWYgKHF1ZXJpZXMubGVuZ3RoID4gMCkge1xuICAgICAgcXVlcnkgPSBgJHtxdWVyaWVzLmpvaW4oJyYnKX1gXG4gICAgfVxuICAgIHZhciBtZXRob2QgPSAnR0VUJ1xuICAgIHZhciB0cmFuc2Zvcm1lciA9IHRyYW5zZm9ybWVycy5nZXRMaXN0T2JqZWN0c1YyVHJhbnNmb3JtZXIoKVxuICAgIHRoaXMubWFrZVJlcXVlc3QoeyBtZXRob2QsIGJ1Y2tldE5hbWUsIHF1ZXJ5IH0sICcnLCBbMjAwXSwgJycsIHRydWUsIChlLCByZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGUpIHtcbiAgICAgICAgcmV0dXJuIHRyYW5zZm9ybWVyLmVtaXQoJ2Vycm9yJywgZSlcbiAgICAgIH1cbiAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXIpXG4gICAgfSlcbiAgICByZXR1cm4gdHJhbnNmb3JtZXJcbiAgfVxuXG4gIC8vIExpc3QgdGhlIG9iamVjdHMgaW4gdGhlIGJ1Y2tldCB1c2luZyBTMyBMaXN0T2JqZWN0cyBWMlxuICAvL1xuICAvLyBfX0FyZ3VtZW50c19fXG4gIC8vICogYGJ1Y2tldE5hbWVgIF9zdHJpbmdfOiBuYW1lIG9mIHRoZSBidWNrZXRcbiAgLy8gKiBgcHJlZml4YCBfc3RyaW5nXzogdGhlIHByZWZpeCBvZiB0aGUgb2JqZWN0cyB0aGF0IHNob3VsZCBiZSBsaXN0ZWQgKG9wdGlvbmFsLCBkZWZhdWx0IGAnJ2ApXG4gIC8vICogYHJlY3Vyc2l2ZWAgX2Jvb2xfOiBgdHJ1ZWAgaW5kaWNhdGVzIHJlY3Vyc2l2ZSBzdHlsZSBsaXN0aW5nIGFuZCBgZmFsc2VgIGluZGljYXRlcyBkaXJlY3Rvcnkgc3R5bGUgbGlzdGluZyBkZWxpbWl0ZWQgYnkgJy8nLiAob3B0aW9uYWwsIGRlZmF1bHQgYGZhbHNlYClcbiAgLy8gKiBgc3RhcnRBZnRlcmAgX3N0cmluZ186IFNwZWNpZmllcyB0aGUga2V5IHRvIHN0YXJ0IGFmdGVyIHdoZW4gbGlzdGluZyBvYmplY3RzIGluIGEgYnVja2V0LiAob3B0aW9uYWwsIGRlZmF1bHQgYCcnYClcbiAgLy9cbiAgLy8gX19SZXR1cm4gVmFsdWVfX1xuICAvLyAqIGBzdHJlYW1gIF9TdHJlYW1fOiBzdHJlYW0gZW1pdHRpbmcgdGhlIG9iamVjdHMgaW4gdGhlIGJ1Y2tldCwgdGhlIG9iamVjdCBpcyBvZiB0aGUgZm9ybWF0OlxuICAvLyAgICogYG9iai5uYW1lYCBfc3RyaW5nXzogbmFtZSBvZiB0aGUgb2JqZWN0XG4gIC8vICAgKiBgb2JqLnByZWZpeGAgX3N0cmluZ186IG5hbWUgb2YgdGhlIG9iamVjdCBwcmVmaXhcbiAgLy8gICAqIGBvYmouc2l6ZWAgX251bWJlcl86IHNpemUgb2YgdGhlIG9iamVjdFxuICAvLyAgICogYG9iai5ldGFnYCBfc3RyaW5nXzogZXRhZyBvZiB0aGUgb2JqZWN0XG4gIC8vICAgKiBgb2JqLmxhc3RNb2RpZmllZGAgX0RhdGVfOiBtb2RpZmllZCB0aW1lIHN0YW1wXG4gIGxpc3RPYmplY3RzVjIoYnVja2V0TmFtZSwgcHJlZml4LCByZWN1cnNpdmUsIHN0YXJ0QWZ0ZXIpIHtcbiAgICBpZiAocHJlZml4ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHByZWZpeCA9ICcnXG4gICAgfVxuICAgIGlmIChyZWN1cnNpdmUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmVjdXJzaXZlID0gZmFsc2VcbiAgICB9XG4gICAgaWYgKHN0YXJ0QWZ0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc3RhcnRBZnRlciA9ICcnXG4gICAgfVxuICAgIGlmICghaXNWYWxpZEJ1Y2tldE5hbWUoYnVja2V0TmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEJ1Y2tldE5hbWVFcnJvcignSW52YWxpZCBidWNrZXQgbmFtZTogJyArIGJ1Y2tldE5hbWUpXG4gICAgfVxuICAgIGlmICghaXNWYWxpZFByZWZpeChwcmVmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRQcmVmaXhFcnJvcihgSW52YWxpZCBwcmVmaXggOiAke3ByZWZpeH1gKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHByZWZpeCkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ByZWZpeCBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgaWYgKCFpc0Jvb2xlYW4ocmVjdXJzaXZlKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncmVjdXJzaXZlIHNob3VsZCBiZSBvZiB0eXBlIFwiYm9vbGVhblwiJylcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhzdGFydEFmdGVyKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc3RhcnRBZnRlciBzaG91bGQgYmUgb2YgdHlwZSBcInN0cmluZ1wiJylcbiAgICB9XG4gICAgLy8gaWYgcmVjdXJzaXZlIGlzIGZhbHNlIHNldCBkZWxpbWl0ZXIgdG8gJy8nXG4gICAgdmFyIGRlbGltaXRlciA9IHJlY3Vyc2l2ZSA/ICcnIDogJy8nXG4gICAgdmFyIGNvbnRpbnVhdGlvblRva2VuID0gJydcbiAgICB2YXIgb2JqZWN0cyA9IFtdXG4gICAgdmFyIGVuZGVkID0gZmFsc2VcbiAgICB2YXIgcmVhZFN0cmVhbSA9IFN0cmVhbS5SZWFkYWJsZSh7IG9iamVjdE1vZGU6IHRydWUgfSlcbiAgICByZWFkU3RyZWFtLl9yZWFkID0gKCkgPT4ge1xuICAgICAgLy8gcHVzaCBvbmUgb2JqZWN0IHBlciBfcmVhZCgpXG4gICAgICBpZiAob2JqZWN0cy5sZW5ndGgpIHtcbiAgICAgICAgcmVhZFN0cmVhbS5wdXNoKG9iamVjdHMuc2hpZnQoKSlcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBpZiAoZW5kZWQpIHtcbiAgICAgICAgcmV0dXJuIHJlYWRTdHJlYW0ucHVzaChudWxsKVxuICAgICAgfVxuICAgICAgLy8gaWYgdGhlcmUgYXJlIG5vIG9iamVjdHMgdG8gcHVzaCBkbyBxdWVyeSBmb3IgdGhlIG5leHQgYmF0Y2ggb2Ygb2JqZWN0c1xuICAgICAgdGhpcy5saXN0T2JqZWN0c1YyUXVlcnkoYnVja2V0TmFtZSwgcHJlZml4LCBjb250aW51YXRpb25Ub2tlbiwgZGVsaW1pdGVyLCAxMDAwLCBzdGFydEFmdGVyKVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IHJlYWRTdHJlYW0uZW1pdCgnZXJyb3InLCBlKSlcbiAgICAgICAgLm9uKCdkYXRhJywgKHJlc3VsdCkgPT4ge1xuICAgICAgICAgIGlmIChyZXN1bHQuaXNUcnVuY2F0ZWQpIHtcbiAgICAgICAgICAgIGNvbnRpbnVhdGlvblRva2VuID0gcmVzdWx0Lm5leHRDb250aW51YXRpb25Ub2tlblxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbmRlZCA9IHRydWVcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0cyA9IHJlc3VsdC5vYmplY3RzXG4gICAgICAgICAgcmVhZFN0cmVhbS5fcmVhZCgpXG4gICAgICAgIH0pXG4gICAgfVxuICAgIHJldHVybiByZWFkU3RyZWFtXG4gIH1cblxuICAvLyBSZW1vdmUgYWxsIHRoZSBub3RpZmljYXRpb24gY29uZmlndXJhdGlvbnMgaW4gdGhlIFMzIHByb3ZpZGVyXG4gIHNldEJ1Y2tldE5vdGlmaWNhdGlvbihidWNrZXROYW1lLCBjb25maWcsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc09iamVjdChjb25maWcpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdub3RpZmljYXRpb24gY29uZmlnIHNob3VsZCBiZSBvZiB0eXBlIFwiT2JqZWN0XCInKVxuICAgIH1cbiAgICBpZiAoIWlzRnVuY3Rpb24oY2IpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgb2YgdHlwZSBcImZ1bmN0aW9uXCInKVxuICAgIH1cbiAgICB2YXIgbWV0aG9kID0gJ1BVVCdcbiAgICB2YXIgcXVlcnkgPSAnbm90aWZpY2F0aW9uJ1xuICAgIHZhciBidWlsZGVyID0gbmV3IHhtbDJqcy5CdWlsZGVyKHtcbiAgICAgIHJvb3ROYW1lOiAnTm90aWZpY2F0aW9uQ29uZmlndXJhdGlvbicsXG4gICAgICByZW5kZXJPcHRzOiB7IHByZXR0eTogZmFsc2UgfSxcbiAgICAgIGhlYWRsZXNzOiB0cnVlLFxuICAgIH0pXG4gICAgdmFyIHBheWxvYWQgPSBidWlsZGVyLmJ1aWxkT2JqZWN0KGNvbmZpZylcbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9LCBwYXlsb2FkLCBbMjAwXSwgJycsIGZhbHNlLCBjYilcbiAgfVxuXG4gIHJlbW92ZUFsbEJ1Y2tldE5vdGlmaWNhdGlvbihidWNrZXROYW1lLCBjYikge1xuICAgIHRoaXMuc2V0QnVja2V0Tm90aWZpY2F0aW9uKGJ1Y2tldE5hbWUsIG5ldyBOb3RpZmljYXRpb25Db25maWcoKSwgY2IpXG4gIH1cblxuICAvLyBSZXR1cm4gdGhlIGxpc3Qgb2Ygbm90aWZpY2F0aW9uIGNvbmZpZ3VyYXRpb25zIHN0b3JlZFxuICAvLyBpbiB0aGUgUzMgcHJvdmlkZXJcbiAgZ2V0QnVja2V0Tm90aWZpY2F0aW9uKGJ1Y2tldE5hbWUsIGNiKSB7XG4gICAgaWYgKCFpc1ZhbGlkQnVja2V0TmFtZShidWNrZXROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQnVja2V0TmFtZUVycm9yKCdJbnZhbGlkIGJ1Y2tldCBuYW1lOiAnICsgYnVja2V0TmFtZSlcbiAgICB9XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNiKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgICB9XG4gICAgdmFyIG1ldGhvZCA9ICdHRVQnXG4gICAgdmFyIHF1ZXJ5ID0gJ25vdGlmaWNhdGlvbidcbiAgICB0aGlzLm1ha2VSZXF1ZXN0KHsgbWV0aG9kLCBidWNrZXROYW1lLCBxdWVyeSB9LCAnJywgWzIwMF0sICcnLCB0cnVlLCAoZSwgcmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChlKSB7XG4gICAgICAgIHJldHVybiBjYihlKVxuICAgICAgfVxuICAgICAgdmFyIHRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXJzLmdldEJ1Y2tldE5vdGlmaWNhdGlvblRyYW5zZm9ybWVyKClcbiAgICAgIHZhciBidWNrZXROb3RpZmljYXRpb25cbiAgICAgIHBpcGVzZXR1cChyZXNwb25zZSwgdHJhbnNmb3JtZXIpXG4gICAgICAgIC5vbignZGF0YScsIChyZXN1bHQpID0+IChidWNrZXROb3RpZmljYXRpb24gPSByZXN1bHQpKVxuICAgICAgICAub24oJ2Vycm9yJywgKGUpID0+IGNiKGUpKVxuICAgICAgICAub24oJ2VuZCcsICgpID0+IGNiKG51bGwsIGJ1Y2tldE5vdGlmaWNhdGlvbikpXG4gICAgfSlcbiAgfVxuXG4gIC8vIExpc3RlbnMgZm9yIGJ1Y2tldCBub3RpZmljYXRpb25zLiBSZXR1cm5zIGFuIEV2ZW50RW1pdHRlci5cbiAgbGlzdGVuQnVja2V0Tm90aWZpY2F0aW9uKGJ1Y2tldE5hbWUsIHByZWZpeCwgc3VmZml4LCBldmVudHMpIHtcbiAgICBpZiAoIWlzVmFsaWRCdWNrZXROYW1lKGJ1Y2tldE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRCdWNrZXROYW1lRXJyb3IoYEludmFsaWQgYnVja2V0IG5hbWU6ICR7YnVja2V0TmFtZX1gKVxuICAgIH1cbiAgICBpZiAoIWlzU3RyaW5nKHByZWZpeCkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ByZWZpeCBtdXN0IGJlIG9mIHR5cGUgc3RyaW5nJylcbiAgICB9XG4gICAgaWYgKCFpc1N0cmluZyhzdWZmaXgpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzdWZmaXggbXVzdCBiZSBvZiB0eXBlIHN0cmluZycpXG4gICAgfVxuICAgIGlmICghQXJyYXkuaXNBcnJheShldmVudHMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdldmVudHMgbXVzdCBiZSBvZiB0eXBlIEFycmF5JylcbiAgICB9XG4gICAgbGV0IGxpc3RlbmVyID0gbmV3IE5vdGlmaWNhdGlvblBvbGxlcih0aGlzLCBidWNrZXROYW1lLCBwcmVmaXgsIHN1ZmZpeCwgZXZlbnRzKVxuICAgIGxpc3RlbmVyLnN0YXJ0KClcblxuICAgIHJldHVybiBsaXN0ZW5lclxuICB9XG59XG5cbkNsaWVudC5wcm90b3R5cGUuZ2V0QnVja2V0Tm90aWZpY2F0aW9uID0gcHJvbWlzaWZ5KENsaWVudC5wcm90b3R5cGUuZ2V0QnVja2V0Tm90aWZpY2F0aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXROb3RpZmljYXRpb24gPSBwcm9taXNpZnkoQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXROb3RpZmljYXRpb24pXG5DbGllbnQucHJvdG90eXBlLnJlbW92ZUFsbEJ1Y2tldE5vdGlmaWNhdGlvbiA9IHByb21pc2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZUFsbEJ1Y2tldE5vdGlmaWNhdGlvbilcblxuLy8gcmVmYWN0b3JlZCBBUEkgdXNlIHByb21pc2UgaW50ZXJuYWxseVxuQ2xpZW50LnByb3RvdHlwZS5tYWtlQnVja2V0ID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5tYWtlQnVja2V0KVxuQ2xpZW50LnByb3RvdHlwZS5idWNrZXRFeGlzdHMgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLmJ1Y2tldEV4aXN0cylcbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0ID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVCdWNrZXQpXG5DbGllbnQucHJvdG90eXBlLmxpc3RCdWNrZXRzID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5saXN0QnVja2V0cylcblxuQ2xpZW50LnByb3RvdHlwZS5nZXRPYmplY3QgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLmdldE9iamVjdClcbkNsaWVudC5wcm90b3R5cGUuZkdldE9iamVjdCA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuZkdldE9iamVjdClcbkNsaWVudC5wcm90b3R5cGUuZ2V0UGFydGlhbE9iamVjdCA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuZ2V0UGFydGlhbE9iamVjdClcbkNsaWVudC5wcm90b3R5cGUuc3RhdE9iamVjdCA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuc3RhdE9iamVjdClcbkNsaWVudC5wcm90b3R5cGUucHV0T2JqZWN0UmV0ZW50aW9uID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5wdXRPYmplY3RSZXRlbnRpb24pXG5DbGllbnQucHJvdG90eXBlLnB1dE9iamVjdCA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUucHV0T2JqZWN0KVxuQ2xpZW50LnByb3RvdHlwZS5mUHV0T2JqZWN0ID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5mUHV0T2JqZWN0KVxuQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVPYmplY3QgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZU9iamVjdClcblxuQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVCdWNrZXRSZXBsaWNhdGlvbiA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0UmVwbGljYXRpb24pXG5DbGllbnQucHJvdG90eXBlLnNldEJ1Y2tldFJlcGxpY2F0aW9uID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRSZXBsaWNhdGlvbilcbkNsaWVudC5wcm90b3R5cGUuZ2V0QnVja2V0UmVwbGljYXRpb24gPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFJlcGxpY2F0aW9uKVxuQ2xpZW50LnByb3RvdHlwZS5nZXRPYmplY3RMZWdhbEhvbGQgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLmdldE9iamVjdExlZ2FsSG9sZClcbkNsaWVudC5wcm90b3R5cGUuc2V0T2JqZWN0TGVnYWxIb2xkID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5zZXRPYmplY3RMZWdhbEhvbGQpXG5DbGllbnQucHJvdG90eXBlLnNldE9iamVjdExvY2tDb25maWcgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnNldE9iamVjdExvY2tDb25maWcpXG5DbGllbnQucHJvdG90eXBlLmdldE9iamVjdExvY2tDb25maWcgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLmdldE9iamVjdExvY2tDb25maWcpXG5DbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldFBvbGljeSA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuZ2V0QnVja2V0UG9saWN5KVxuQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRQb2xpY3kgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnNldEJ1Y2tldFBvbGljeSlcbkNsaWVudC5wcm90b3R5cGUuZ2V0QnVja2V0VGFnZ2luZyA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuZ2V0QnVja2V0VGFnZ2luZylcbkNsaWVudC5wcm90b3R5cGUuZ2V0T2JqZWN0VGFnZ2luZyA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuZ2V0T2JqZWN0VGFnZ2luZylcbkNsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0VGFnZ2luZyA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0VGFnZ2luZylcbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0VGFnZ2luZyA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0VGFnZ2luZylcbkNsaWVudC5wcm90b3R5cGUuc2V0T2JqZWN0VGFnZ2luZyA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuc2V0T2JqZWN0VGFnZ2luZylcbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlT2JqZWN0VGFnZ2luZyA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUucmVtb3ZlT2JqZWN0VGFnZ2luZylcbkNsaWVudC5wcm90b3R5cGUuZ2V0QnVja2V0VmVyc2lvbmluZyA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuZ2V0QnVja2V0VmVyc2lvbmluZylcbkNsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0VmVyc2lvbmluZyA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0VmVyc2lvbmluZylcbkNsaWVudC5wcm90b3R5cGUuc2VsZWN0T2JqZWN0Q29udGVudCA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuc2VsZWN0T2JqZWN0Q29udGVudClcbkNsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0TGlmZWN5Y2xlID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5zZXRCdWNrZXRMaWZlY3ljbGUpXG5DbGllbnQucHJvdG90eXBlLmdldEJ1Y2tldExpZmVjeWNsZSA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuZ2V0QnVja2V0TGlmZWN5Y2xlKVxuQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVCdWNrZXRMaWZlY3ljbGUgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZUJ1Y2tldExpZmVjeWNsZSlcbkNsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0RW5jcnlwdGlvbiA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuc2V0QnVja2V0RW5jcnlwdGlvbilcbkNsaWVudC5wcm90b3R5cGUuZ2V0QnVja2V0RW5jcnlwdGlvbiA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUuZ2V0QnVja2V0RW5jcnlwdGlvbilcbkNsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0RW5jcnlwdGlvbiA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUucmVtb3ZlQnVja2V0RW5jcnlwdGlvbilcbkNsaWVudC5wcm90b3R5cGUuZ2V0T2JqZWN0UmV0ZW50aW9uID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5nZXRPYmplY3RSZXRlbnRpb24pXG5DbGllbnQucHJvdG90eXBlLnJlbW92ZU9iamVjdHMgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZU9iamVjdHMpXG5DbGllbnQucHJvdG90eXBlLnJlbW92ZUluY29tcGxldGVVcGxvYWQgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnJlbW92ZUluY29tcGxldGVVcGxvYWQpXG5DbGllbnQucHJvdG90eXBlLmNvcHlPYmplY3QgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLmNvcHlPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLmNvbXBvc2VPYmplY3QgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLmNvbXBvc2VPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLnByZXNpZ25lZFVybCA9IGNhbGxiYWNraWZ5KENsaWVudC5wcm90b3R5cGUucHJlc2lnbmVkVXJsKVxuQ2xpZW50LnByb3RvdHlwZS5wcmVzaWduZWRHZXRPYmplY3QgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnByZXNpZ25lZEdldE9iamVjdClcbkNsaWVudC5wcm90b3R5cGUucHJlc2lnbmVkUHV0T2JqZWN0ID0gY2FsbGJhY2tpZnkoQ2xpZW50LnByb3RvdHlwZS5wcmVzaWduZWRQdXRPYmplY3QpXG5DbGllbnQucHJvdG90eXBlLnByZXNpZ25lZFBvc3RQb2xpY3kgPSBjYWxsYmFja2lmeShDbGllbnQucHJvdG90eXBlLnByZXNpZ25lZFBvc3RQb2xpY3kpXG4iXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQSxPQUFPLEtBQUtBLE1BQU07QUFFbEIsT0FBT0MsTUFBTSxNQUFNLFFBQVE7QUFFM0IsT0FBTyxLQUFLQyxNQUFNLE1BQU0sY0FBYTtBQUNyQyxTQUFTQyxXQUFXLFFBQVEsNEJBQTJCO0FBQ3ZELFNBQVNDLFdBQVcsUUFBUSx1QkFBc0I7QUFDbEQsU0FBU0MsY0FBYyxRQUFRLGdDQUErQjtBQUM5RCxTQUNFQyxTQUFTLEVBQ1RDLFVBQVUsRUFDVkMsUUFBUSxFQUNSQyxRQUFRLEVBQ1JDLFFBQVEsRUFDUkMsaUJBQWlCLEVBQ2pCQyxhQUFhLEVBQ2JDLFNBQVMsRUFDVEMsU0FBUyxRQUNKLHVCQUFzQjtBQUM3QixTQUFTQyxVQUFVLFFBQVEsNEJBQTJCO0FBQ3RELFNBQVNDLGtCQUFrQixFQUFFQyxrQkFBa0IsUUFBUSxvQkFBbUI7QUFDMUUsU0FBU0MsU0FBUyxRQUFRLGlCQUFnQjtBQUMxQyxPQUFPLEtBQUtDLFlBQVksTUFBTSxvQkFBbUI7QUFFakQsY0FBYyxjQUFhO0FBQzNCLGNBQWMsZUFBYztBQUM1QixjQUFjLG9CQUFtQjtBQUNqQyxTQUFTZCxjQUFjLEVBQUVVLFVBQVU7QUFFbkMsT0FBTyxNQUFNSyxNQUFNLFNBQVNoQixXQUFXLENBQUM7RUFDdEM7RUFDQTtFQUNBO0VBQ0E7O0VBRUE7RUFDQWlCLGdCQUFnQkEsQ0FBQ0MsVUFBVSxFQUFFQyxNQUFNLEVBQUVDLE1BQU0sRUFBRUMsYUFB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