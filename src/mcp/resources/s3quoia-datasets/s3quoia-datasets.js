import BaseResource from '../base-resource.js';
import { buildDatasetContext } from '../../utils/utils.js';

export default class S3QuoiaDatasetsResource extends BaseResource {
  name = 's3quoia-datasets';
  uri = 's3quoia://datasets';

  isEnabled() {
    return !!this.config.datasets?.length;
  }

  getMeta() {
    return {
      title: 'Configured Datasets',
      description: 'Available datasets: bucket, prefix, file path template, partitioning, and resource types.',
      mimeType: 'text/plain',
    };
  }

  handler(uri) {
    const text = buildDatasetContext(this.config.datasets);
    return { contents: [{ uri: uri.href, text, mimeType: 'text/plain' }] };
  }
}
