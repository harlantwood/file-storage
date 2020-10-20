import type { AppWebsocket, CellId } from '@holochain/conductor-api';
import { FileMetadata } from '../types';
import { dateToTimestamp, timestampToDate } from '../utils';

export class FileStorageService {
  /**
   *
   * @param appWebsocket connection to the holochain backend
   * @param cellId the cell to which to upload the file
   * @param zomeName the zome name of the file_storage zome in the given cell
   */
  constructor(
    protected appWebsocket: AppWebsocket,
    protected cellId: CellId,
    protected zomeName: string = 'file_storage'
  ) {}

  /**
   * Upload a file to the file_storage zome, splitting it into chunks
   *
   * @param file file to split and upload
   * @param chunkSize chunk size to split the file, default 256 KB
   */
  async uploadFile(
    file: File,
    chunkSize: number = 256 * 1024
  ): Promise<string> {
    const blobs = this._splitFile(file, chunkSize);

    const chunksHashes = blobs.map(this._createChunk);

    const fileToCreate = {
      name: file.name,
      size: file.size,
      fileType: file.type,
      lastModified: dateToTimestamp(new Date(file.lastModified)),
      chunksHashes,
    };
    const hash = await this._callZome('create_file_metadata', fileToCreate);
    console.log(hash);

    return hash;
  }

  async downloadFile(fileHash: string): Promise<File> {
    const metadata = await this.getFileMetadata(fileHash);

    const fetchChunksPromises = metadata.chunksHashes.map(this.fetchChunk);

    const chunks = await Promise.all(fetchChunksPromises);

    const file = new File(chunks, metadata.name, {
      lastModified: metadata.lastModifed,
      type: metadata.fileType,
    });

    return file;
  }

  async getFileMetadata(fileHash: string): Promise<FileMetadata> {
    const metadata = await this._callZome('get_file_metadata', fileHash);

    return {
      ...metadata,
      lastModifed: timestampToDate(metadata).valueOf(),
    };
  }

  async fetchChunk(fileChunkHash: string): Promise<Blob> {
    return this._callZome('get_file_chunk', fileChunkHash);
  }

  /** Private helpers */

  private _splitFile(file: File, chunkSize: number): Blob[] {
    let offset = 0;
    const chunks: Blob[] = [];

    while (file.size > offset) {
      const chunk = file.slice(offset, offset + chunkSize);
      offset += chunkSize;
      chunks.push(chunk);
    }

    return chunks;
  }

  private async _createChunk(chunk: Blob): Promise<string> {
    const bytes = await chunk.arrayBuffer();

    return this._callZome(
      'create_file_chunk',
      Array.from(new Uint8Array(bytes))
    );
  }

  private _callZome(fnName: string, payload: any): Promise<any> {
    return this.appWebsocket.callZome({
      cap: null as any,
      cell_id: this.cellId,
      zome_name: this.zomeName,
      fn_name: fnName,
      payload: payload,
      provenance: this.cellId[1],
    });
  }
}