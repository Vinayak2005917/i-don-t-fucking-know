from pathlib import Path

import torch
from transformers import AutoTokenizer, AutoModel


DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
MODEL_NAME = "google-bert/bert-base-uncased"
MODEL_CACHE_DIR = Path(__file__).parent / "bert-base-uncased"

print(f"Using device: {DEVICE}")


def load_bert_model():
    """Load BERT from the local cache, downloading it once when necessary."""
    try:
        tokenizer = AutoTokenizer.from_pretrained(
            MODEL_NAME,
            cache_dir=MODEL_CACHE_DIR,
            local_files_only=True,
        )
        model = AutoModel.from_pretrained(
            MODEL_NAME,
            cache_dir=MODEL_CACHE_DIR,
            local_files_only=True,
        )
        print(f"Loaded BERT from {MODEL_CACHE_DIR}")
    except (OSError, EnvironmentError):
        print(f"BERT is not cached. Downloading it to {MODEL_CACHE_DIR}...")
        MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        tokenizer = AutoTokenizer.from_pretrained(
            MODEL_NAME,
            cache_dir=MODEL_CACHE_DIR,
        )
        model = AutoModel.from_pretrained(
            MODEL_NAME,
            cache_dir=MODEL_CACHE_DIR,
        )
        print("BERT download complete. Future starts will use the local cache.")

    return tokenizer, model


tokenizer, model = load_bert_model()
model = model.to(DEVICE)
model.eval()

# BERT-base has 512 positional embeddings. Keep the token sequence and the
# returned token list truncated identically so clause segmentation never gets
# a token/embedding length mismatch on long stories.
MAX_TOKEN_LENGTH = 512


#tokenize the original text
#embedd the original text
#cat the embeddings of each token with the embeddings of the original text
#return [n,2*embedding_dim] where n is the number of tokens in the original text
def text_to_embeddings(text):
    encoding = tokenizer(
        text,
        return_tensors="pt",
        return_offsets_mapping=True,
        add_special_tokens=False,
        truncation=True,
        max_length=MAX_TOKEN_LENGTH,
    )

    tokens = tokenizer.convert_ids_to_tokens(encoding["input_ids"][0])
    encoding.pop("offset_mapping", None)

    # Transformer embedding lookups require integer index tensors.  Some
    # tokenizer/model combinations return token_type_ids (and occasionally
    # attention_mask) with a floating dtype, which causes CUDA failures in
    # BERT's embedding layer even though input_ids was already corrected.
    for key in ("input_ids", "token_type_ids", "attention_mask"):
        if key in encoding:
            encoding[key] = encoding[key].long()

    encoding = {
        key: value.to(DEVICE)
        for key, value in encoding.items()
    }

    with torch.no_grad():
        outputs = model(**encoding)

    text_embedding = outputs.last_hidden_state.mean(dim=1)
    token_embeddings = outputs.last_hidden_state

    concatenated_embeddings = torch.cat(
        [
            token_embeddings,
            text_embedding.unsqueeze(1).expand(
                -1,
                token_embeddings.size(1),
                -1,
            ),
        ],
        dim=2,
    )

    return concatenated_embeddings

def text_to_tokens(text):
    encoding = tokenizer(
        text,
        return_tensors="pt",
        return_offsets_mapping=True,
        add_special_tokens=False,
        truncation=True,
        max_length=MAX_TOKEN_LENGTH,
    )
    tokens = tokenizer.convert_ids_to_tokens(encoding["input_ids"][0])
    return tokens
