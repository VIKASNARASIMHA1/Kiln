# Neural networks, LLMs and RAG

A neural network stacks layers of weighted sums followed by non-linear activations. Training uses gradient descent: compute the loss, use backpropagation to find how each weight affects it, then nudge the weights to reduce it.

Large language models are transformer networks trained to predict the next token. The attention mechanism lets each token weigh the other tokens in the context. LLMs can state wrong facts confidently, which is called hallucination.

Retrieval-augmented generation reduces this: relevant passages are retrieved from your documents, often with embeddings or keyword search, and placed in the prompt so the model answers from them and can cite sources.
