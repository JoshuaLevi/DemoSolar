import { SearchClient, SearchIndexClient, AzureKeyCredential } from "@azure/search-documents";
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
const apiKey = process.env.AZURE_SEARCH_ADMIN_KEY;
const indexName = process.env.AZURE_SEARCH_INDEX_NAME || "demosolar-knowledgebase"; // Default fallback

// Validate credentials
if (!endpoint) {
  throw new Error("Azure Search endpoint is not defined. Set AZURE_SEARCH_ENDPOINT in backend/.env");
}
if (!apiKey) {
  throw new Error("Azure Search admin key is not defined. Set AZURE_SEARCH_ADMIN_KEY in backend/.env");
}
if (!indexName) {
    throw new Error("Azure Search index name is not defined. Set AZURE_SEARCH_INDEX_NAME in backend/.env");
}

const credential = new AzureKeyCredential(apiKey);

// Client for managing indexes (creating, updating, deleting)
const searchIndexClient = new SearchIndexClient(endpoint, credential);

// Client for searching and uploading documents to a specific index
const searchClient = new SearchClient(endpoint, indexName, credential);

console.log(`Initialized Azure AI Search clients for endpoint '${endpoint}' and index '${indexName}'`);

// Export the clients for use in other parts of the application
export { searchClient, searchIndexClient, indexName }; 