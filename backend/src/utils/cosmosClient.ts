import { CosmosClient } from "@azure/cosmos";
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file in the backend directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectionString = process.env.AZURE_COSMOS_DB_CONNECTION_STRING;
const databaseName = process.env.AZURE_COSMOS_DB_DATABASE_NAME || "demosolar_db"; // Default fallback
const containerName = process.env.AZURE_COSMOS_DB_CONTAINER_NAME || "conversations"; // Default fallback

// Validate the connection string
if (!connectionString) {
  throw new Error("Azure Cosmos DB connection string is not defined. Please set AZURE_COSMOS_DB_CONNECTION_STRING in your backend/.env file.");
}

// Initialize the Cosmos client
let cosmosClient: CosmosClient;
try {
    cosmosClient = new CosmosClient(connectionString);
} catch (error) {
    console.error("Failed to initialize CosmosClient:", error);
    throw new Error("Could not initialize Cosmos DB Client. Check connection string format.");
}

// Get a reference to the database and container
const database = cosmosClient.database(databaseName);
const container = database.container(containerName);

console.log(`Initialized Cosmos DB client for database '${databaseName}' and container '${containerName}'`);

// Export the container instance for use in other parts of the application
export { container, database, cosmosClient };

// Optional: Add a function to ensure database and container exist (useful for first run)
// async function ensureDbAndContainerExist() {
//   try {
//     const { database: db } = await cosmosClient.databases.createIfNotExists({ id: databaseName });
//     console.log(`Database '${db.id}' ensured.`);
//     const { container: cont } = await db.containers.createIfNotExists({
//        id: containerName,
//        partitionKey: { paths: ["/conversationId"] } // Match the partition key used during creation
//      });
//     console.log(`Container '${cont.id}' ensured.`);
//   } catch (error) {
//     console.error("Error ensuring database/container:", error);
//     // Handle error appropriately
//   }
// }

// Ensure the function is called appropriately if needed, e.g., at server startup
// ensureDbAndContainerExist(); 