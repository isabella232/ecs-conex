#!/usr/bin/env node

'use strict';

/* eslint-disable no-console */

const AWS = require('aws-sdk');
const region = process.argv[2];
const repo = process.argv[3];

if (!module.parent) {
  getImages(region, repo, (err, res) => {
    if (err) handleCb(err);
    // Delete anything older than the 50 commits on the default branch
    // and anything older than 849 commits on any other branch
    const deployCommits = imagesToDelete(res, 50, /^save-[a-z0-9]{40}$|save/);
    const regularCommits = imagesToDelete(res, 849, /^cleanup-[a-z0-9]{40}$|cleanup/);
    const imageIds = regularCommits.concat(deployCommits);
    if (!imageIds.length) handleCb(null, 'No images to delete');
    deleteImages(region, repo, imageIds, (err, res) => {
      if (err) handleCb(err);
      if (res) handleCb(null, res);
    });
  });
}

module.exports.handleCb = handleCb;
function handleCb(err, res) {
  err ? console.log(err) : console.log(res);
  err ? process.exit(1) : process.exit(0);
}

module.exports.getImages = getImages;
function getImages(region, repo, callback) {
  let details = [];
  let ecr = new AWS.ECR({ region: region });
  describeImages(repo, null, callback);

  function describeImages(repo, token) {
    let params = { repositoryName: repo };
    if (token) params.nextToken = token;

    ecr.describeImages(params, (err, data) => {
      if (err) return callback(err);
      details = details.concat(data.imageDetails);
      data.nextToken ? describeImages(repo, data.nextToken, callback) : callback(null, details);
    });
  }
}

module.exports.imagesToDelete = imagesToDelete;
function imagesToDelete(images, max, pattern) {
  const validated = images.filter((e) => { return e.imageTags && pattern.test(e.imageTags.join(' ')); });
  const sorted = validated.sort((a, b) => { return new Date(a.imagePushedAt) - new Date(b.imagePushedAt); });
  const spliced = sorted.splice(0, sorted.length - max);
  const digests = spliced.map((e) => { return { imageDigest: e.imageDigest }; });
  return digests;
}

module.exports.deleteImages = deleteImages;
function deleteImages(region, repo, imageIds, callback) {
  let ecr = new AWS.ECR({ region: region });
  ecr.batchDeleteImage({
    imageIds: imageIds,
    repositoryName: repo
  }, callback);
}
