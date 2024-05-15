import { Injectable } from '@angular/core';
import { InstanceFactory } from 'ngforage';
import { DB_NAME } from 'src/app/config';

/**
 * Factory service for instantiating localForage objects for storage service.
 */
@Injectable({
  providedIn: 'root'
})
export class StorageServiceFactory {

  private DB_NAME = DB_NAME;

  constructor(private ngForage: InstanceFactory) {}

  /**
   * Creates a `LocalForage` instance for the specified store.
   * @param storeName Table identifier.
   * @returns A `LocalForage` instance.
   */
  public getStorageService(storeName: string): LocalForage {
    return this.ngForage.getInstance({
      name: `__${this.DB_NAME}`,
      storeName: `_${storeName}`
    });
  }
  
}
