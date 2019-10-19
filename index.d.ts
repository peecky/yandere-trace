interface YandereOption {
    serverBaseAddress: string;
    dataPath: string;
    dbPath: string;
    maxFetchingFileCount?: number;
}
interface TaskResult {
    isBusy?: boolean;
}
interface TaskCallback {
    (err: Error, result: TaskResult | null): any;
}
export declare class Yandere {
    private serverBaseAddress;
    private dataPath;
    private imageDataPath;
    private dbPath;
    private maxFetchingFileCount;
    private orm;
    private Post;
    private isUnderFetchingPosts;
    private lastPostInfoFetchedAt;
    constructor(option: YandereOption);
    install(option: any, callback: (err?: Error) => any): void;
    private isUserInactive;
    private fetchPostInfos;
    private fetchNewPostInfos;
    private fetchPost;
    private getFetchedFileCount;
    fetchPostsAsync(option?: {
        skipFileFetching?: boolean;
    }): Promise<TaskResult | null>;
    fetchPosts(option: any, callback: TaskCallback): void;
    private deletePostFileData;
    private deletePostData;
    private deleteOldPostFiles;
    private deleteOldPosts;
    deleteOldDataAsync(): Promise<TaskResult>;
    deleteOldData(option: any, callback: TaskCallback): void;
    getPostsAsync(option: {
        page?: number;
        pagingUnit?: number;
        fromDate?: Date;
    }): Promise<{
        postInfos: {
            postId: number;
            src: string | null;
            filePath: string | null;
            postCreatedAt: Date;
            updatedAt: Date;
        }[];
    }>;
    getPosts(option: {
        page?: number;
        pagingUnit?: number;
        fromDate?: Date;
    }, callback: any): void;
    markRead(option: {
        postIds: number[];
    }, callback: any): void;
    getStats(option: any, callback: any): void;
}
export {};
