import { SearchIndexClient, SearchIndex, KnownAnalyzerNames } from "@azure/search-documents";
import { searchIndexClient, searchClient, indexName } from "../utils/searchClient";
import { KnowledgeDocument } from "../models/types";

// Define the structure of the search index
const indexDefinition: SearchIndex = {
  name: indexName,
  fields: [
    { name: "id", type: "Edm.String", key: true, filterable: true, sortable: true },
    { name: "title", type: "Edm.String", searchable: true, analyzerName: KnownAnalyzerNames.EnLucene },
    { name: "content", type: "Edm.String", searchable: true, analyzerName: KnownAnalyzerNames.EnLucene },
    { name: "category", type: "Edm.String", filterable: true, facetable: true, sortable: true },
    // --- Vector Field Configuration ---
    {
        name: "embedding",
        type: "Collection(Edm.Single)",
        searchable: true,
        vectorSearchDimensions: 1536, // Example dimension for text-embedding-ada-002
        vectorSearchProfileName: "my-vector-profile",
    },
    // Add other fields as needed
  ],
  // --- Vector Search Profile Configuration ---
  vectorSearch: {
    profiles: [
        {
            name: "my-vector-profile",
            algorithmConfigurationName: "my-hnsw-config",
        },
    ],
    algorithms: [
        {
            name: "my-hnsw-config",
            kind: "hnsw", // Hierarchical Navigable Small World algorithm
            // Parameters can be tuned, but defaults are often sufficient
            // hnswParameters: {
            //     m: 4,
            //     efConstruction: 400,
            //     efSearch: 500,
            //     metric: "cosine"
            // }
        },
    ],
  },
  // Optional: Add suggesters, scoring profiles etc.
};

/**
 * Checks if the search index exists and creates it if it doesn't.
 */
export async function ensureIndexExists() {
  try {
    console.log(`Checking if index '${indexName}' exists...`);
    await searchIndexClient.getIndex(indexName);
    console.log(`Index '${indexName}' already exists.`);
  } catch (error: any) {
    // If getIndex fails (commonly with a 404 error), the index doesn't exist
    if (error.statusCode === 404) {
      console.log(`Index '${indexName}' does not exist. Creating...`);
      try {
        await searchIndexClient.createIndex(indexDefinition);
        console.log(`Index '${indexName}' created successfully.`);
      } catch (creationError) {
        console.error(`Failed to create index '${indexName}':`, creationError);
        throw creationError; // Re-throw after logging
      }
    } else {
      // Re-throw other errors
      console.error("Error checking for index:", error);
      throw error;
    }
  }
}

// --- Functions for adding/searching documents will go here ---

/**
 * Adds or updates documents in the search index.
 * @param documents - An array of documents to be indexed.
 */
export async function addDocumentsToIndex(documents: any[]) {
    if (!documents || documents.length === 0) {
        console.log("No documents provided to index.");
        return;
    }
    try {
        const result = await searchClient.mergeOrUploadDocuments(documents);
        console.log(`Indexed ${result.results.length} documents.`);
        // Optional: Check result.results for individual document outcomes
        return result;
    } catch (error) {
        console.error("Error uploading documents to index:", error);
        throw error;
    }
}

/**
 * Performs a basic keyword search on the index.
 * (Vector search functionality can be added later)
 * @param searchText - The text to search for.
 * @param options - Optional search parameters (e.g., filters, top).
 * @returns An array of KnowledgeDocument objects.
 */
export async function performKeywordSearch(
    searchText: string,
    options?: any
): Promise<KnowledgeDocument[]> {
    console.log(`Performing keyword search for: "${searchText}"`);
    try {
        // Remove the explicit selection of '@search.score'
        // Just use the options passed in, or default
        const searchOptions = {
            ...options,
            includeTotalCount: true // Keep this for logging
        };

        const searchResults = await searchClient.search(searchText, searchOptions);
        console.log(`Found ${searchResults.count ?? 0} total results.`);

        // Process results and cast to the specific type
        const results: KnowledgeDocument[] = [];
        for await (const result of searchResults.results) {
            // Cast the document to our interface
            const doc = result.document as KnowledgeDocument;
            // Add the score from the result object, not the document itself
            doc['@search.score'] = result.score;
            results.push(doc);
        }
        return results;
    } catch (error) {
        console.error("Error during keyword search:", error);
        throw error;
    }
}

// Example usage (call ensureIndexExists at application startup):
// ensureIndexExists().catch(console.error); 