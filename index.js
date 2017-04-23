"use strict";
const path = require("path");
const url = require("url");
const xml2js = require("xml2js-es6-promise");
const Sequelize = require("sequelize");
const fs = require("fs-extra-promise");
const request = require("request");
const rp = require("request-promise");
const ms = require("millisecond");
const FETCH_POST_INFO_LIMIT = 35;
const FETCH_POST_LIMIT = 10;
const READ_POST_LIFETIME = ms('3d');
const UNREAD_POST_LIFETIME = ms('100d');
const DELETING_LIMIT = 100;
module.exports = class Yandere {
    constructor(option) {
        this.postsToFetch = [];
        this.isUnderFetchingPosts = false;
        this.serverBaseAddress = option.serverBaseAddress;
        this.dataPath = option.dataPath;
        this.imageDataPath = path.join(this.dataPath, 'public', 'images');
        this.dbPath = option.dbPath;
        this.orm = new Sequelize(null, null, null, {
            dialect: 'sqlite',
            logging: process.env.NODE_ENV === 'production' ? false : console.log,
            storage: this.dbPath
        });
        const imageDataPath = this.imageDataPath;
        this.Post = this.orm.define('post', {
            postId: { type: Sequelize.INTEGER, allowNull: false, unique: true, primaryKey: true },
            filePath: { type: Sequelize.STRING },
            isRead: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }
        }, {
            instanceMethods: {
                getActualFilePath: function () {
                    return this.filePath ? path.join(imageDataPath, this.filePath) : this.filePath;
                }
            }
        });
    }
    init(option, callback) {
        Promise.all([
            fs.ensureDirAsync(path.dirname(this.dbPath)),
            fs.ensureDirAsync(this.imageDataPath)
        ])
            .then(() => this.Post.sync())
            .then(() => callback(null))
            .catch(callback);
    }
    fetchPostInfos(page, limit) {
        return rp(`${this.serverBaseAddress}/post.xml?limit=${limit || FETCH_POST_INFO_LIMIT}&page=${page || 1}`)
            .then(body => xml2js(body, { explicitArray: false, mergeAttrs: true }))
            .then((result) => result.posts.post);
    }
    fetchNewPostInfos() {
        return this.Post.findOne({ order: [['postId', 'DESC']] })
            .then((lastPost) => {
            if (!lastPost)
                return this.fetchPostInfos(); // very begining of fetching. fetching from the last page (not the first page due to too many archived data exists)
            const lastPostId = lastPost.postId;
            let postsToFetch = [];
            let page = 1;
            const limit = FETCH_POST_INFO_LIMIT;
            const fetch = () => {
                return this.fetchPostInfos(page, limit)
                    .then(postList => {
                    const postListOfPage = postList.filter((postInfo) => Number(postInfo.id) > lastPostId);
                    postsToFetch = postsToFetch.concat(postListOfPage);
                    if (postListOfPage.length < limit)
                        return postsToFetch;
                    page += 1;
                    return fetch();
                });
            };
            return fetch();
        });
    }
    fetchPost(postInfo) {
        const postId = Number(postInfo.id);
        const ext = path.extname(url.parse(postInfo.sample_url).pathname);
        const filePath = postInfo.md5 + ext;
        return new Promise((resolve, reject) => {
            const localPath = path.join(this.imageDataPath, filePath);
            request(postInfo.sample_url).on('error', reject)
                .pipe(fs.createWriteStream(localPath)).on('error', reject)
                .on('finish', () => resolve());
        })
            .then(() => this.Post.create({ postId, filePath }));
    }
    fetchPosts(option, callback) {
        if (this.isUnderFetchingPosts)
            return process.nextTick(callback, null, null);
        this.isUnderFetchingPosts = true;
        let postsToFetch = this.postsToFetch;
        const finalCallback = (err) => {
            this.postsToFetch = postsToFetch;
            this.isUnderFetchingPosts = false;
            process.nextTick(callback, err || null, { isBusy: !err && postsToFetch.length > 0 });
        };
        let fetchedPostCount = 0;
        const fetch = () => {
            if (fetchedPostCount >= FETCH_POST_LIMIT)
                return Promise.resolve();
            const postInfo = postsToFetch[0];
            if (!postInfo)
                return Promise.resolve();
            return this.fetchPost(postInfo)
                .then(() => {
                postsToFetch.shift();
                fetchedPostCount += 1;
                return fetch();
            });
        };
        fetch()
            .then(() => {
            if (postsToFetch.length > 0)
                return finalCallback(null); // remainings will be continued at next function call
            this.fetchNewPostInfos()
                .then((postInfos) => {
                if (postInfos.length === 0)
                    return finalCallback();
                postsToFetch = postInfos.sort((a, b) => Number(a.id) - Number(b.id));
                fetch()
                    .then(() => finalCallback())
                    .catch(finalCallback);
            })
                .catch(finalCallback);
        })
            .catch(finalCallback);
    }
    deletePostFileData(post) {
        const filePath = post.getActualFilePath();
        if (!filePath)
            return Promise.resolve();
        return fs.removeAsync(filePath)
            .then(() => post.update({ filePath: null }, null));
    }
    deletePostData(post) {
        return this.deletePostFileData(post)
            .then(() => post.destroy());
    }
    deleteOldData(option, callback) {
        let isBusy;
        this.Post.findAll({
            where: {
                $or: [
                    {
                        isRead: true,
                        updatedAt: { $lt: new Date(Date.now() - READ_POST_LIFETIME) }
                    },
                    {
                        filePath: { $ne: null },
                        createdAt: { $lt: new Date(Date.now() - UNREAD_POST_LIFETIME) }
                    }
                ]
            },
            limit: DELETING_LIMIT
        })
            .then((posts) => {
            isBusy = posts.length >= DELETING_LIMIT;
            return posts.reduce((prev, post) => {
                return prev.then(() => post.isRead ? this.deletePostData(post) : this.deletePostFileData(post));
            }, Promise.resolve());
        })
            .then(() => process.nextTick(callback, null, { isBusy }))
            .catch(err => callback(err, null));
    }
};
