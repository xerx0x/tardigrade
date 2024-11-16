import { Transaction, connectDB } from "@/components/backend/mongodb";
import { tardigradeHistory } from "@/components/types";
import { createHash } from 'crypto';

export const revalidate = 60; // Revalidate every 60 seconds
export const dynamic = 'force-dynamic'; // Required for revalidation to work properly


enum ActivityType {
    ACTIVITY_TOKEN_SWAP = "ACTIVITY_TOKEN_SWAP",
    ACTIVITY_AGG_TOKEN_SWAP = "ACTIVITY_AGG_TOKEN_SWAP",
}

export const GET = async () => {
    await connectDB();

    function hashSignature(signature: string): string {
        return createHash('sha256').update(signature).digest('hex');
    }

    // Function to convert a hex string to a normalized number in [-1, 1]
    function hexToNormalizedNumber(hex: string): number {
        // Convert hex to integer
        const intValue = parseInt(hex, 16);

        // Maximum hex value for the given length
        const maxHex = Math.pow(16, hex.length) - 1;

        // Normalize to [0, 1]
        const normalized = intValue / maxHex;

        // Map to [-1, 1]
        return normalized * 2 - 1;
    }

    // Function to generate weights and biases from hash
    function generateWeightsAndBiases(signature: string, numWeights: number, numBiases: number): { weights: number[]; biases: number[] } {
        const hash = hashSignature(signature);

        const totalSegments = numWeights + numBiases;
        const segmentLength = Math.floor(hash.length / totalSegments);

        const weights: number[] = [];
        const biases: number[] = [];

        for (let i = 0; i < numWeights; i++) {
            const start = i * segmentLength;
            const end = start + segmentLength;
            const segment = hash.substring(start, end);
            weights.push(hexToNormalizedNumber(segment));
        }

        for (let i = 0; i < numBiases; i++) {
            const start = (numWeights + i) * segmentLength;
            const end = start + segmentLength;
            const segment = hash.substring(start, end);
            biases.push(hexToNormalizedNumber(segment));
        }

        return { weights, biases };
    }

    function softmax(outputs: number[]): number[] {
        const maxOutput = Math.max(...outputs);
        const expOutputs = outputs.map(output => Math.exp(output - maxOutput));
        const sumExpOutputs = expOutputs.reduce((sum, val) => sum + val, 0);
        return expOutputs.map(val => val / sumExpOutputs);
    }

    // Define a Neuron class with weights, bias, and activation function
    class Neuron {
        weights: number[];
        bias: number;
        activation: number;
        activationFunction: (x: number) => number;

        constructor(weights: number[], bias: number = 0, activationFunction?: (x: number) => number) {
            this.weights = weights;
            this.bias = bias;
            this.activation = 0;
            this.activationFunction = activationFunction || this.sigmoid;
        }

        // Activation using the specified activation function
        activate(inputs: number[]): number {
            if (inputs.length !== this.weights.length) {
                throw new Error("Input and weight vectors must be of the same length.");
            }

            const weightedSum = inputs.reduce(
                (sum, input, idx) => sum + input * this.weights[idx],
                this.bias
            );
            this.activation = this.activationFunction(weightedSum);
            return this.activation;
        }


        // Sigmoid activation function
        sigmoid(x: number): number {
            return 1 / (1 + Math.exp(-x));
        }

        // ReLU activation function
        relu(x: number): number {
            return Math.max(0, x);
        }

        // Tanh activation function
        tanh(x: number): number {
            return Math.tanh(x);
        }
    }

    // Function to simulate neuron activity through a neural network
    const simulateNeuronActivity = (
        sensoryInputs: number[],
        neuronLayers: Neuron[][]
    ): string => {
        // Forward pass through each layer of the neural network
        let inputs = sensoryInputs;

        neuronLayers.forEach((layer) => {
            const outputs: number[] = [];
            layer.forEach((neuron) => {
                const activation = neuron.activate(inputs);
                outputs.push(activation);
            });
            inputs = outputs; // Output of current layer becomes input to the next
        });

        // Motor neurons output probabilities for each direction
        const motorActivations = softmax(inputs);
        const directions = ["up", "down", "left", "right"];
        const maxActivation = Math.max(...motorActivations);
        const direction = directions[motorActivations.indexOf(maxActivation)];

        return direction;
    };

    // Initialize motor neurons with unique weights and biases based on transaction signature
    function generateNeuronParams(signature: string, neuronIndex: number, numWeights: number, numBiases: number): { weights: number[]; bias: number } {
        const modifiedSignature = `${signature}_${neuronIndex}`;
        const { weights, biases } = generateWeightsAndBiases(modifiedSignature, numWeights, numBiases);
        return { weights, bias: biases[0] };
    }


    // Helper function to calculate next position based on motor response
    const calculateNextPosition = (direction: string, p_wP: tardigradeHistory) => {
        const { x, y } = p_wP || { x: 0, y: 0 };
        switch (direction) {
            case "up":
                return { x, y: y + 1 };
            case "down":
                return { x, y: y - 1 };
            case "left":
                return { x: x - 1, y };
            case "right":
                return { x: x + 1, y };
            default:
                return { x, y };
        }
    };

    const transactions = await Transaction.find({}).sort({ blockTime: 1 });

    // Initialize the tardigrade's movement history
    const tardigradeHistory: tardigradeHistory[] = [];

    let index = 0;

    // Add initial position
    tardigradeHistory.push({
        x: 0,
        y: 0,
        direction: "none",
        affectedTransactions: [],
        index: index++,
        timestamp: 0,
    });

    // Group transactions into chunks
    const transactionBundleSize = 50;
    const transactionGroups = [];
    for (let i = 0; i < transactions.length; i += transactionBundleSize) {
        const group = transactions.slice(i, i + transactionBundleSize);
        if (group.length > 0) {
            transactionGroups.push(group);
        }
    }

    const sensoryNeurons = [
        new Neuron([1, 0, 0], 0, Neuron.prototype.relu),   // Buy amount
        new Neuron([0, 1, 0], 0, Neuron.prototype.relu),   // Sell amount
        new Neuron([0, 0, 1], 0, Neuron.prototype.relu),   // Transaction count
    ];

    // First hidden layer neurons (complex interneurons)
    const hiddenLayer1 = [
        new Neuron([0.54789, -0.31456, 0.26934], 0.12345, Neuron.prototype.tanh),
        new Neuron([-0.41892, 0.61734, -0.11238], -0.23456, Neuron.prototype.relu),
        new Neuron([0.31459, 0.37891, 0.34567], 0.01234, Neuron.prototype.sigmoid),
        new Neuron([-0.21987, 0.81234, -0.51789], 0.05678, Neuron.prototype.tanh),
    ];

    // L2
    const hiddenLayer2 = [
        new Neuron([0.79234, -0.51892, 0.41234, 0.11789], 0.05432, Neuron.prototype.relu),
        new Neuron([-0.61789, 0.91234, -0.31892, 0.21456], -0.12345, Neuron.prototype.sigmoid),
        new Neuron([0.21789, 0.23456, 0.61234, -0.41892], 0.23456, Neuron.prototype.tanh),
        new Neuron([0.11234, -0.21789, 0.51456, 0.31892], -0.05678, Neuron.prototype.relu),
    ];

    // L3 
    const hiddenLayer3 = [
        new Neuron([0.41892, -0.61234, 0.31789, 0.21456], 0.03456, Neuron.prototype.sigmoid),
        new Neuron([-0.51234, 0.71892, -0.21789, 0.41234], -0.07891, Neuron.prototype.tanh),
        new Neuron([0.31892, 0.11789, 0.51234, -0.31456], 0.12345, Neuron.prototype.relu),
        new Neuron([0.21789, 0.23456, 0.21234, 0.22345], 0.01234, Neuron.prototype.sigmoid),
    ];

    // Assemble layers into the neural network
    const neuronLayers = [
        sensoryNeurons,    // Input layer
        hiddenLayer1,      // Hidden layer 1
        hiddenLayer2,      // Hidden layer 2
        hiddenLayer3,      // Hidden layer 3
    ];


    for (const transactionGroup of transactionGroups) {
        const prevtardigradePosition = tardigradeHistory[tardigradeHistory.length - 1];

        let buyAmount = 0;   // Total amount from buy transactions
        let sellAmount = 0;  // Total amount from sell transactions
        const affectedTransactions: string[] = [];
        let timestamp = 0;

        // Process transactions in the current group
        for (const tx of transactionGroup) {
            const activityType = tx.activity_type;
            const amount = Number(tx.amount) || 0; // Ensure amount is numeric
            affectedTransactions.push(tx.signature);

            if (activityType === ActivityType.ACTIVITY_AGG_TOKEN_SWAP) {
                // Buy transaction
                buyAmount += amount;
            } else if (activityType === ActivityType.ACTIVITY_TOKEN_SWAP) {
                // Sell transaction
                sellAmount += amount;
            }

            timestamp = tx.blockTime * 1000; // Convert blockTime to milliseconds
        }

        // Additional input: transaction count
        const transactionCount = transactionGroup.length;

        // Normalize inputs (e.g., by scaling amounts)
        const totalAmount = buyAmount + sellAmount || 1;
        const normalizedBuy = buyAmount / totalAmount;
        const normalizedSell = sellAmount / totalAmount;
        const normalizedTransactionCount = transactionCount / transactionBundleSize;

        // Sensory inputs to the neural network
        const sensoryInputs = [normalizedBuy, normalizedSell, normalizedTransactionCount];

        // Generate unique signature for this transaction group
        const groupSignature = affectedTransactions.join('-');

        // Initialize motor neurons
        const motorNeurons = [
            (() => {
                const params = generateNeuronParams(groupSignature, 1, 4, 1);
                return new Neuron(params.weights, params.bias, Neuron.prototype.sigmoid);
            })(), // Up

            (() => {
                const params = generateNeuronParams(groupSignature, 2, 4, 1);
                return new Neuron(params.weights, params.bias, Neuron.prototype.sigmoid);
            })(), // Down

            (() => {
                const params = generateNeuronParams(groupSignature, 3, 4, 1);
                return new Neuron(params.weights, params.bias, Neuron.prototype.sigmoid);
            })(), // Left

            (() => {
                const params = generateNeuronParams(groupSignature, 4, 4, 1);
                return new Neuron(params.weights, params.bias, Neuron.prototype.sigmoid);
            })(), // Right
        ];

        const updatedNeuronLayers = [...neuronLayers, motorNeurons];

        const direction = simulateNeuronActivity(sensoryInputs, updatedNeuronLayers);
        // Calculate the next position based on the motor response
        const nextPosition = calculateNextPosition(direction, prevtardigradePosition);

        const tardigradeHistoryItem: tardigradeHistory = {
            x: nextPosition.x,
            y: nextPosition.y,
            direction,
            affectedTransactions,
            index: index++,
            timestamp,
        };
        tardigradeHistory.push(tardigradeHistoryItem);
    }

    return new Response(JSON.stringify(tardigradeHistory), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
};
